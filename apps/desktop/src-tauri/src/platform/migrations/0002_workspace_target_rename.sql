UPDATE workspace
SET target = 'local'
WHERE target = 'host';

UPDATE workspace
SET target = 'remote'
WHERE target = 'remote_host';
