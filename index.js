var
  crypto = require('crypto'),
  parser = require('markdown-parse'),
  request = require('request');

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
    process: function(payload, callback) {
      console.log(payload);
      if (payload.action === 'opened') {
        // do nothing
        return callback(null);
      }

      if (payload.action === 'labeled') {
        if (payload.issue.label === config.labels.talk) {
          // process talk
          var talk = {
            speaker: payload.issue.sender,
            title: payload.issue.title
          };
          return callback(null, talk);
        } else if (payload.issue.label === config.labels.job) {
          // process jobs
        }
      }
    }
  };
};
