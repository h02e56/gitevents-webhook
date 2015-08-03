var
  debug = require('debug')('gitevents-webhook'),
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
      debug('action: ' + payload.action);
      if (payload.action === 'opened') {
        // do nothing
        return callback(null);
      } else if (payload.action === 'labeled') {
        debug('label: ' + payload.label.name);
        if (payload.label.name === config.labels.proposal) {
          // process talk proposal
          var proposal = {
            speaker: payload.issue.sender,
            title: payload.issue.title
          };
          return callback(null, proposal);
        } else if (payload.issue.label === config.labels.job) {
          // process jobs
          return callback(null);
        } else {
          // process others
          return callback(null);
        }
      } else {
        throw new Error('Unknown error occured.');
      }
    }
  };
};
