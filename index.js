'use strict';

var
  debug = require('debug')('gitevents-webhook'),
  crypto = require('crypto'),
  parser = require('markdown-parse'),
  moment = require('moment'),
  GitHubApi = require('github');

Object.prototype.findById = function(id) {
  for (var i = 0; i < this.length; i++) {
    if (this[i].id === id) {
      return i;
    }
  }
  return -1;
};

module.exports = function(config) {
  if (!config) {
    return callback(new Error('No configuration found'));
  }

  var github = new GitHubApi({
    version: '3.0.0',
    debug: config.debug,
    protocol: 'https',
    timeout: 5000,
    headers: {
      'user-agent': 'GitEvents'
    }
  });

  return {
    process: function(payload, callback) {
      debug('action: ' + payload.action);

      github.authenticate({
        type: 'oauth',
        token: config.github.token
      });

      if (payload.action === 'opened') {
        // do nothing
        return callback(null);
      } else if (payload.action === 'labeled') {
        debug('label: ' + payload.label.name);

        github.user.getFrom({
          user: payload.sender.login
        }, function(error, user) {

          if (payload.issue && payload.issue.body) {
            var file;

            parser(payload.issue.body, function(error, body) {
              if (error) {
                return callback(new Error(error));
              } else {
                if (payload.label.name === config.labels.proposal) {
                  // process talk proposal

                  var proposal = {
                    id: payload.issue.id,
                    type: 'proposal',
                    speaker: {
                      id: user.id,
                      name: user.name,
                      location: user.location,
                      github: user.login,
                      gravatar: user.gravatar_id,
                      avatar: user.avatar_url
                    },
                    title: payload.issue.title,
                    description: body.html
                  };

                  if (body.attributes.twitter) {
                    proposal.speaker.twitter = body.attributes.twitter;
                  }

                  if (body.attributes.language) {
                    proposal.language = body.attributes.language;
                  }

                  if (body.attributes.level) {
                    proposal.level = body.attributes.level;
                  }

                  if (body.attributes.month) {
                    proposal.month = body.attributes.month;
                  }

                  if (body.attributes.tags) {
                    proposal.tags = body.attributes.tags;
                  }

                  github.repos.getContent({
                    user: config.github.user,
                    repo: config.github.repo,
                    path: 'proposals.json'
                  }, function(error, proposals) {
                    if (error && error.code === 404) {
                      // create an array for all future proposals and store on GitHub.
                      debug('proposals.json doesn\'t exist. Creating.');
                      proposal.updated_at = new Date().toJSON();
                      proposal.created_at = new Date().toJSON();
                      proposals = [proposal];

                      file = new Buffer(JSON.stringify(proposals, null, 2)).toString('base64');

                      github.repos.createContent({
                        user: config.github.user,
                        repo: config.github.repo,
                        path: 'proposals.json',
                        content: file,
                        message: 'Created proposals'
                      }, function(error, res) {
                        if (error) {
                          return callback(new Error(error));
                        }
                        return callback(null, proposal);
                      });
                    } else if (error) {
                      return callback(new Error(error));
                    } else {
                      // get proposals and update
                      var updatedProposals, message;

                      try {
                        updatedProposals = JSON.parse(new Buffer(proposals.content, 'base64').toString('ascii'));
                      } catch (error) {
                        return callback(new Error(error));
                      }

                      var id = updatedProposals.findById(proposal.id);
                      if (id !== -1) {
                        debug('Proposal exists. Update.');

                        // update the proposal; don't change the speaker
                        proposal.updated_at = new Date().toJSON();
                        proposal.created_at = updatedProposals[id].created_at;
                        proposal.speaker = updatedProposals[id].speaker;
                        updatedProposals[id] = proposal;
                        message = 'Updated proposal by ' + proposal.speaker.github;
                      } else {
                        debug('Push new proposal.');

                        proposal.created_at = new Date().toJSON();
                        updatedProposals.push(proposal);
                        message = 'New proposal by ' + proposal.speaker.github;
                      }

                      file = new Buffer(JSON.stringify(updatedProposals, null, 2)).toString('base64');

                      github.repos.updateFile({
                        user: config.github.user,
                        repo: config.github.repo,
                        path: 'proposals.json',
                        sha: proposals.sha,
                        content: file,
                        message: message
                      }, function(error, res) {
                        if (error) {
                          debug(error);
                          return callback(new Error(error));
                        }
                        debug('All done. Returning.');
                        return callback(null, proposal);
                      });
                    }
                  });
                } else if (payload.label.name === config.labels.talk) {
                  // process talk from proposals

                  github.repos.getContent({
                    user: config.github.user,
                    repo: config.github.repo,
                    path: 'proposals.json'
                  }, function(error, proposals) {
                    if (error) {
                      return callback(new Error(error));
                    } else {
                      // get proposals and update
                      var readableProposals, message;

                      try {
                        readableProposals = JSON.parse(new Buffer(proposals.content, 'base64').toString('ascii'));
                      } catch (error) {
                        return callback(new Error(error));
                      }

                      var proposalId = readableProposals.findById(payload.issue.id);
                      if (proposalId === -1) {
                        debug('Proposal doesn\'t exist');
                        return callback(new Error('Proposal doesn\'t exist.'));
                      } else {
                        debug('Proposal found. Id: ' + proposalId);
                        var talk = readableProposals[proposalId];

                        if (!payload.issue.milestone) {
                          debug('Missing milestone');
                          return callback(new Error('No Milestone (=Event) defined.'));
                        } else {

                          var date = moment(payload.issue.milestone.due_on).toArray();
                          var time = payload.issue.milestone.description.split(';')[0].split(':');
                          date[3] = parseInt(time[0], 10);
                          date[4] = parseInt(time[1], 10);

                          if (!date[4]) {
                            date[4] = 0;
                          }

                          var event = {
                            id: payload.issue.milestone.id,
                            type: 'event',
                            location: {
                              name: payload.issue.milestone.description.split(';')[1],
                              address: payload.issue.milestone.description.split(';')[2]
                            },
                            date: moment.utc(date).toJSON(),
                            name: payload.issue.milestone.title
                          };

                          github.repos.getContent({
                            user: config.github.user,
                            repo: config.github.repo,
                            path: 'events-' + new Date(payload.issue.created_at).getFullYear() + '.json'
                          }, function(error, events) {
                            if (error && error.code === 404) {
                              // create an array for all future proposals and store on GitHub.
                              debug('events file doesn\'t exist. Creating a new one.');

                              event.talks = [];
                              talk.accepted_at = new Date().toJSON();
                              talk.type = 'talk';
                              event.talks.push(talk);
                              events = [event];

                              file = new Buffer(JSON.stringify(events, null, 2)).toString('base64');

                              github.repos.createContent({
                                user: config.github.user,
                                repo: config.github.repo,
                                path: 'events-' + new Date(payload.issue.created_at).getFullYear() + '.json',
                                content: file,
                                message: 'Created events'
                              }, function(error, res) {
                                if (error) {
                                  return callback(new Error(error));
                                }
                                return callback(null, event);
                              });
                            } else {
                              debug('Found existing events. Parsing.');

                              var readableEvents;

                              try {
                                readableEvents = JSON.parse(new Buffer(events.content, 'base64').toString('ascii'));
                              } catch (error) {
                                debug('JSON parse error', error);
                                return callback(new Error(error));
                              }

                              var github_event_id = payload.issue.milestone.id;
                              var foundEventId = readableEvents.findById(github_event_id);
                              var message;

                              if (foundEventId !== -1) {
                                debug('Found event.');

                                var talkId = readableEvents[foundEventId].talks.findById(payload.issue.id);

                                if (talkId !== -1) {
                                  debug('Updating existing talk.');
                                  talk = readableEvents[foundEventId].talks[talkId];

                                  talk.updated_at = new Date().toJSON();
                                  talk.created_at = readableEvents[foundEventId].talks[talkId].created_at;
                                  talk.speaker = readableEvents[foundEventId].talks[talkId].speaker;
                                  readableEvents[foundEventId].talks[talkId] = talk;
                                  message = 'Updated talk by ' + talk.speaker.github;
                                } else {
                                  debug('Adding new talk.');

                                  talk.accepted_at = new Date().toJSON();
                                  talk.type = 'talk';
                                  readableEvents[foundEventId].talks.push(talk);
                                  message = 'Added talk by ' + proposal.speaker.github;
                                }
                              } else {
                                debug('No event found. Creating and adding talk.');

                                event.talks = [];
                                talk.accepted_at = new Date().toJSON();
                                talk.type = 'talk';
                                event.talks.push(talk);
                                readableEvents.push(event);
                                message = 'Created new event and added talk by ' + proposal.speaker.github;
                              }

                              debug('Writing file.');
                              file = new Buffer(JSON.stringify(readableEvents, null, 2)).toString('base64');

                              github.repos.updateFile({
                                user: config.github.user,
                                repo: config.github.repo,
                                path: 'events-' + new Date(payload.issue.created_at).getFullYear() + '.json',
                                sha: events.sha,
                                content: file,
                                message: message
                              }, function(error, res) {
                                if (error) {
                                  debug(error);
                                  return callback(new Error(error));
                                }

                                debug('Removing proposal.');
                                readableProposals.splice(proposalId, 1);
                                file = new Buffer(JSON.stringify(readableProposals, null, 2)).toString('base64');

                                github.repos.updateFile({
                                  user: config.github.user,
                                  repo: config.github.repo,
                                  path: 'proposals.json',
                                  sha: proposals.sha,
                                  content: file,
                                  message: 'Moved proposal to talks.'
                                }, function(error, res) {
                                  if (error) {
                                    debug(error);
                                    return callback(new Error(error));
                                  }

                                  debug('All done. Returning.');
                                  return callback(null, event);
                                });
                              });
                            }
                          });
                        }
                      }
                    }
                  });
                } else if (payload.issue.label === config.labels.job) {
                  // process jobs
                  return callback(null);
                } else {
                  // process others
                  return callback(null);
                }
              }
            });
          }
        });
      } else {
        return callback(new Error('Unknown error occured.'));
      }
    }
  };
};
