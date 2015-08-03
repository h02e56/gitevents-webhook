'use strict';

var
  debug = require('debug')('gitevents-webhook'),
  crypto = require('crypto'),
  parser = require('markdown-parse'),
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
    throw new Error('No configuration found');
  }

  var github = new GitHubApi({
    // required
    version: '3.0.0',
    // optional
    debug: false,
    protocol: 'https',
    timeout: 5000,
    headers: {
      'user-agent': 'GitEvents' // GitHub is happy with a unique user agent
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
                throw new Error(error);
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
                      proposals = [];
                      proposal.updated_at = new Date().toJSON();
                      proposal.created_at = new Date().toJSON();
                      proposals.push(proposal);

                      file = new Buffer(JSON.stringify(proposals, null, 2)).toString('base64');

                      github.repos.createContent({
                        user: config.github.user,
                        repo: config.github.repo,
                        path: 'proposals.json',
                        content: file,
                        message: 'Created proposals'
                      }, function(error, res) {
                        if (error) {
                          throw new Error(error);
                        }
                        return callback(null, proposal);
                      });
                    } else if (error) {
                      throw new Error(error);
                    } else {
                      // get proposals and update
                      var updatedProposals, message;

                      try {
                        updatedProposals = JSON.parse(new Buffer(proposals.content, 'base64').toString('ascii'));
                      } catch (error) {
                        throw new Error(error);
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
                      }, function (error, res) {
                        if (error) {
                          debug(error);
                          throw new Error(error);
                        }
                        debug('All done. Returning.');
                        return callback(null, proposal);
                      });
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
        throw new Error('Unknown error occured.');
      }
    }
  };
};
