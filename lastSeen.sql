SELECT
    data.id,
    data.deviceName AS device,
    TIMEDIFF(NOW(), from_unixtime(timestamp/1000)) AS time,
    temperature/100 AS temperature,
    humidity/100 AS humidity
FROM data INNER JOIN (SELECT id, deviceName, MAX(timestamp) AS time FROM data GROUP BY id, deviceName) AS lastSeen ON data.id = lastSeen.id AND data.deviceName = lastSeen.deviceName AND data.timestamp = lastSeen.time;


SELECT
    data.id,
    data.deviceName AS device,
    from_unixtime(timestamp/1000) AS time,
    temperature/100 AS temperature,
    humidity/100 AS humidity
FROM data INNER JOIN (SELECT id, deviceName, MAX(timestamp) AS time FROM data GROUP BY id, deviceName) AS lastSeen ON data.id = lastSeen.id AND data.deviceName = lastSeen.deviceName AND data.timestamp = lastSeen.time;