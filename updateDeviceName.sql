UPDATE
  data AS d
  INNER JOIN (
    SELECT distinct id as id, deviceName FROM data WHERE id != deviceName
  ) AS lookup ON d.id = lookup.id
  SET d.deviceName = lookup.deviceName
  WHERE d.id = d.deviceName;