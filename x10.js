const {
	findByIds,
} = require('usb');

const RELEASE_TIMEOUT_MILLISECONDS = 100;

const KEYS = {
	1: 'Tv',
	2: 'Video',
	3: 'Radio',
	4: 'Info',
		6: 'Unknown1',
	7: 'Red',
	8: 'Green',
	9: 'Yellow',
	10: 'Blue',
	69: 'Down',
	77: 'Up',
	85: 'Mute',
	87: 'Power',
		89: 'CdDvd',
	90: 'Photo',
	91: 'Audio',
	93: 'Volume-',
	94: 'Volume+',
	96: 'Channel+',
	97: 'Channel-',
	98: '1',
	99: '2',
	100: '3',
	101: '4',
	102: '5',
	103: '6',
	104: '7',
	105: '8',
	106: '9',
		107: 'Unknown2',
	108: '0',
		109: 'Capture',
	110: 'Menu',
	112: 'Select',
		113: 'Repeat',
	114: 'Left',
		115: 'Ok',
	116: 'Right',
	117: 'Back',
	118: 'Prev',
	120: 'Next',
	121: 'FastRew',
	122: 'Play',
	123: 'FastFwd',
	124: 'Record',
	125: 'Stop',
	126: 'Pause',
};

const detach_kernel_driver_if_necessary = ((
	device_interface,
) => {
	if (device_interface.isKernelDriverActive()) {
		device_interface.detachKernelDriver();
		return (() => {
			device_interface.attachKernelDriver();
		});
	} else {
		return (() => {
		});
	}
});

const release_device_interface_async = ((
	device_interface,
	close_endpoints=true,
) =>
	(new Promise((resolve, reject) => {
		device_interface.release(close_endpoints, ((error) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		}));
	}))
);

const extract_key_code_from_code = ((code) =>
	(code & 0x7F)
);

module.exports = ((RED) => {
	const X10 = (function(configuration) {
		RED.nodes.createNode(this, configuration);
		const node = this;
		const device = findByIds(0x0BC7, 0x0006);
		if (device) {
			// X10 receiver found
			device.open();
			const device_interface = device.interface(0);
			const attach_kernel_driver_if_necessary = detach_kernel_driver_if_necessary(device_interface);
			device_interface.claim();
			const device_interface_in_endpoint = device_interface.endpoint(0x81);
			node.on('close', (async (removed, done) => {
				await release_device_interface_async(device_interface);
				attach_kernel_driver_if_necessary();
				device.close();
				done();
			}));
			const emit = ((
				event_id,
				code,
				duration=undefined,
			) => {
				const key_code = extract_key_code_from_code(code);
				const message = {
					payload: {
						timestamp: Date.now(),
						event: event_id,
						key_code: key_code,
						key: KEYS[key_code],
					},
				};
				if (duration !== undefined) {
					message.payload.duration = duration;
				}
				node.send([
					message,
					((event_id === 'press') ? message : null),
					((event_id === 'hold') ? message : null),
					((event_id === 'release') ? message : null),
				]);
			});
			let last_code, last_code_first_timestamp, last_code_latest_timestamp, timeout_id;
			device_interface_in_endpoint.on('data', ((data) => {
				const current_code = data[1];
				last_code_latest_timestamp = Date.now();
				const last_code_duration = (last_code_latest_timestamp - last_code_first_timestamp);
				if (timeout_id) {
					clearTimeout(timeout_id);
				}
				timeout_id = setTimeout((() => {
					emit('release', last_code, last_code_duration);
					last_code = last_code_first_timestamp = last_code_latest_timestamp = timeout_id = undefined;
				}), RELEASE_TIMEOUT_MILLISECONDS);
				if (current_code !== last_code) {
					if (last_code !== undefined) {
						emit('release', last_code, last_code_duration);
					}
					emit('press', current_code);
					last_code = current_code;
					last_code_first_timestamp = last_code_latest_timestamp;
				} else {
					emit('hold', last_code, last_code_duration);
				}
			}));
			device_interface_in_endpoint.startPoll();
			this.status({
				fill: 'green',
				shape: 'dot',
				text: 'OK',
			});
		} else {
			// No X10 receiver found
			this.status({
				fill: 'red',
				shape: 'dot',
				text: 'No X10 receiver',
			});
		}
	});
	RED.nodes.registerType('x10', X10);
});
