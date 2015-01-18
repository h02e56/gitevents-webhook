var
  test = require('tape'),
  config = require('../config'),
  webhook = require('../index')(config),
  data = require('./data/labeled');

test('webhook', function (t) {
  t.plan(0);

  webhook.process(data, function (error, body) {
    if (error) {
      t.end();
    } else {
      t.end();
    }
  });
});
