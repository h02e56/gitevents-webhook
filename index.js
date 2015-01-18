var
  crypto = require('crypto'),
  async = require('async'),
  parser = require('markdown-parse'),
  request = require('request');

/**
 * Extract the label from the payload
 */
var label = function label(payload) {
  return payload.label.name;
};

/**
 * Extract the repository API URL from the payload
 */
var repositoryAPIURL = function repositoryAPIURL(payload) {
  return payload.repository.url;
};

module.exports = function (config) {
  if (!config) {
    throw new Error('No configuration found');
  }

  if (config.github) {
    config = config.github;
  } else {
    config = config;
  }

  return {
    process: function (payload, callback) {
      async.parallel({
        issues: function issues(fn) {
          var url = repositoryAPIURL(payload) + '/issues?labels=' + encodeURIComponent(label(payload));
          var options = {
            url: url,
            headers: {
              'User-Agent': 'GitEvents'
            }
          };

          // make the actual HTTP request
          request(options, function (error, response, body) {
            if (body && typeof body === 'string') {
              var
                issues,
                resultset = [];

              try {
                issues = JSON.parse(body);
              } catch (e) {
                return callback(e);
              }

              async.each(issues, function (issue, fn) {
                var is_talk = issue.labels.map(function (label) {
                  if (label.name === config.talk_label) {
                    return true;
                  } else {
                    return false;
                  }
                });

                if (is_talk) {
                  // Bloody YAML parser freaks out with @-handles
                  if (issue.body.indexOf('@') > -1) {
                    issue.body = issue.body.replace('@', '');
                  }
                  parser(issue.body, function (error, result) {
                    // TODO: if there's no markdown in the issue description, maybe meta data isn't required?
                    if (error) {
                      fn(error);
                    } else {
                      resultset.push({
                        'title': issue.title,
                        'level': result.attributes.level,
                        'language': result.attributes.language,
                        'speaker': {
                          'github': issue.user.login,
                          'gravatar': issue.user.gravatar_id,
                          'portrait': issue.user.avatar_url,
                          'twitter': result.attributes.twitter,
                        },
                        'description': result.body
                      });
                      fn();
                    }
                  });
                } else {
                  // TODO: Jobs ... other labels?
                  fn();
                }
              }, function (errors) {
                console.log(resultset);
              });
            } else {
              return callback(error);
            }
          });
        },
        milestone: function milestone(fn) {
          // TODO: Get milestone information, if it's an event
          fn();
        }
      }, function (errors, results) {
        console.log('done');
      });
    }
  };
};
