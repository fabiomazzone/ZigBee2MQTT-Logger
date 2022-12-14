import * as mqtt from 'mqtt';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv-flow';

dotenv.config();

const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME;

const DB_TABLE_ORDER = process.env.DB_TABLE_ORDER?.split(',') || [];

const MQTT_SERVER = process.env.MQTT_SERVER;
const MQTT_PORT = process.env.MQTT_PORT;
const MQTT_TOPIC = process.env.MQTT_TOPIC;
const MQTT_DEVICES_TOPIC = `${MQTT_TOPIC}/${process.env.MQTT_DEVICES_TOPIC}`;

const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    connectionLimit: process.env.DB_CONNECTION_LIMIT ? parseInt(process.env.DB_CONNECTION_LIMIT) : 10,
    trace: true,
});

const client: mqtt.MqttClient = mqtt.connect(`mqtt://${MQTT_SERVER}:${MQTT_PORT}`);

const devices: Record<string, string> = {};

interface MQTT_Device {
    ieee_address: string;
    friendly_name: string;
    type: string;
    definition: {
      exposes: [
        {
          name: string;
          property: string;
        }
      ]
    }
}

client.on('connect', () => {
  console.log('connected');
  client.subscribe(`${MQTT_DEVICES_TOPIC}`, (err) => {
    if (err) {
      console.log(err);
    }
  });
});

client.on('message', (topic, message) => {
  if(topic === MQTT_DEVICES_TOPIC) {
    const payload = JSON.parse(message.toString()) as MQTT_Device[];
    const endDevices = payload.filter((device) => device.type === 'EndDevice')
    const sensors = endDevices
        .filter((device) =>
            device.definition.exposes.reduce((acc, expose) => acc || expose.name === 'temperature', false)
        )
        .filter((device) =>
            device.definition.exposes.reduce((acc, expose) => acc || expose.name === 'humidity', false)
        );

    const deviceList = sensors.map((device) => ({id: device.ieee_address, name: device.friendly_name}));
    const newSensors = deviceList.filter(({id}) => !devices[id]);

    console.log(`newDevices:     ${newSensors.map(({name}) => name)}`);
    if(newSensors.length > 0) {
      client.subscribe(newSensors.map(({name}) => `${MQTT_TOPIC}/${name}`), (err) => {
        if (err) {
          console.log(err);
        }
      });

      newSensors.forEach(({id, name}) => {
        devices[id] = name;
      });
    }

    const removedDevices = Object.keys(devices).filter((id) => !deviceList.find((device) => device.id === id)).map((id) => ({id, name: devices[id]}));
    console.log(`removedDevices: ${removedDevices.map(({name}) => name)}`);

    if(removedDevices.length > 0) {
      client.unsubscribe(removedDevices.map(({name}) => `${MQTT_TOPIC}/${name}`));

      removedDevices.forEach(({id}) => {
        delete devices[id];
      });
    }

    const updatedSensors = deviceList.filter(({id, name}) => devices[id] !== name);
    console.log(`updatedDevices: ${updatedSensors.map(({name}) => name)}`);
    if(updatedSensors.length > 0) {
      updatedSensors.forEach(({id, name}) => {
        client.unsubscribe(`${MQTT_TOPIC}/${devices[id]}`);
        client.subscribe(`${MQTT_TOPIC}/${name}`, (err) => {
          if (err) {
            console.log(err);
          }
        });
        devices[id] = name;
      });
    }

    console.log(`devices:        ${Object.values(devices)}`);

    return
  }
  client.emit('data', topic, message);
});

client.on('data', async (topic: string, message: Buffer) => {

  const [_, deviceName] = topic.split('/');
  const devicePairs = Object.entries(devices);

  if(devicePairs.find(([_, name]) => name === deviceName) && message.length > 0) {
    const payload = JSON.parse(message.toString());
    const {temperature, humidity} = payload;

    const [id, _] = devicePairs.find(([id, name]) => name === deviceName) as [string, string];

    const data = {
      id,
      temperature: Number.parseFloat(temperature) * 100,
      humidity: Number.parseFloat(humidity) * 100,
      deviceName,
      timestamp: new Date().getTime(),
    };
    try {
      insertData(data);
      console.log(data)
    } catch (err) {
      console.error(err);
    }
  }
});


async function insertData(data: Record<string, string | number>) {
  const conn = await pool.getConnection();
  console.log('got connection');
  const [results, fields] = await conn.query('INSERT INTO data VALUES (?, ?, ?, ?, ?)', [...DB_TABLE_ORDER].map((key) => data[key]));
  console.log('insert values')
  conn.release();
  console.log(`update status: ${JSON.stringify(results)}`);
}


process.on('SIGTERM', () => {
  console.log('bye bye');
  client.end();
  pool.end();
});

process.on('SIGINT', () => {
  console.log('bye bye');
  client.end();
  pool.end();
});
process.on('SIGUSR2', () => {
  console.log('bye bye');
  client.end();
  pool.end();
});
process.on('exit', () => {
  console.log('bye bye');
  client.end();
  pool.end();
});