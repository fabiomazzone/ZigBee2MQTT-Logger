import * as mqtt from 'mqtt';

const SERVER = 'homebridge.fritz.box';
const PORT = 1883
const TOPIC = 'zigbee2mqtt';
const DEVICES_TOPIC = `${TOPIC}/bridge/devices`;

const client: mqtt.MqttClient = mqtt.connect(`mqtt://${SERVER}:${PORT}`);

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
  client.subscribe(`${DEVICES_TOPIC}`, (err) => {
    if (err) {
      console.log(err);
    }
  });
});

client.on('message', (topic, message) => {
  if(topic === DEVICES_TOPIC) {
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
      client.subscribe(newSensors.map(({name}) => `${TOPIC}/${name}`), (err) => {
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
      client.unsubscribe(removedDevices.map(({name}) => `${TOPIC}/${name}`));

      removedDevices.forEach(({id}) => {
        delete devices[id];
      });
    }

    const updatedSensors = deviceList.filter(({id, name}) => devices[id] !== name);
    console.log(`updatedDevices: ${updatedSensors.map(({name}) => name)}`);
    if(updatedSensors.length > 0) {
      updatedSensors.forEach(({id, name}) => {
        client.unsubscribe(`${TOPIC}/${devices[id]}`);
        client.subscribe(`${TOPIC}/${name}`, (err) => {
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



  const [_, deviceName] = topic.split('/');
  const devicePairs = Object.entries(devices);

  if(devicePairs.find(([_, name]) => name === deviceName) && message.length > 0) {
    const payload = JSON.parse(message.toString());
    const {temperature, humidity} = payload;

    const [id, _] = devicePairs.find(([id, name]) => name === deviceName) as [string, string];

    const data = {
      id,
      temperature,
      humidity,
      deviceName,
      timestamp: new Date().getTime()
    };
  }
});


process.on('SIGINT', () => {
  console.log('bye bye');
  client.end();
});