/**
 ClassX Liveboard module for BitFocus Companion
 ______________________________________________

 ClassX s.r.l.
 */

// Required modules
const tcp = require('../../tcp')
const instance_skel = require('../../instance_skel')

// Base64 compatibility
const atob = (data) => Buffer.from(data, 'base64').toString('ascii')
const btoa = (data) => Buffer.from(data).toString('base64')

/**
 * Main instance -> instance_skel
 */
class ClassXLiveBoard extends instance_skel {
	/**
	 * Instance ctor
	 * @param {any} system
	 * @param {any} id
	 * @param {any} config
	 */
	constructor(system, id, config) {
		super(system, id, config)
		this.lbContents = []
		this.dataCallback = []
		this.contentStatus = {
			//Client events types
			ET_ADDCLIENT: 0,
			ET_REMOVECLIENT: 1,
			ET_SUSPENDCLIENT: 2,
			ET_RESUMECLIENT: 3,
			ET_START: 4,
			ET_STOP: 5,
			ET_SUSPEND: 6,
			ET_RESUME: 7,
			ET_CLIENT_PAUSED_ON: 8,
			ET_CLIENT_PAUSED_OFF: 9,
			ET_RESETCLIENT: 10,
			ET_REMOVINGCLIENT: 11,
			ET_SUSPENDINGCLIENT: 12,
			ET_CLIENT_FRAMEMARKER: 13,
			ET_INIT: 14,
			ET_DISPOSE: 15,
			//Companion feedbacks
			PLAYING: 100,
			PAUSED: 101,
			STOPPED: 102,
		}
		this.initActions()
		this.initFeedbacks()
	}

	/**
	 * Create instance config property list
	 */
	config_fields() {
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'This module will establish a connection to ClassX LiveBoard.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: "LiveBoard's IP",
				width: 12,
				regex: this.REGEX_IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: "LiveBoard's command port",
				width: 6,
				regex: this.REGEX_PORT,
			},
			{
				type: 'textinput',
				id: 'eventport',
				label: "LiveBoard's event port",
				width: 6,
				regex: this.REGEX_PORT,
			},
			{
				type: 'checkbox',
				id: 'protocollog',
				label: 'Protocol log to console',
				width: 12,
			},
		]
	}

	/**
	 * dtor
	 */
	destroy() {
		if (this.socket !== undefined) this.socket.destroy()

		if (this.eventsocket !== undefined) this.eventsocket.destroy()

		this.debug('destroy', this.id)
	}

	/**
	 * Instance initialize
	 */
	init() {
		this.initTCP()
	}

	/**
	 * Set instance actions
	 */
	initActions() {
		let genericOption = [
			{
				type: 'textinput',
				label: 'Content Name',
				id: 'content',
				regex: this.REGEX_SOMETHING,
			},
		]

		this.setActions({
			tap_action: {
				label: 'Content Tap',
				options: genericOption,
				callback: (e) => {
					let contentStatus = this.getLBContent(e.options.content).status
					let cmd = `LBC_PLAYCONTENT`
					if (contentStatus == this.contentStatus.PAUSED) cmd = `LBC_RESUMECONTENT`
					if (contentStatus == this.contentStatus.PLAYING) cmd = `LBC_STOPCONTENT`
					this.sendCommand(cmd + ` "` + e.options.content.replace(/"/g, '\\"') + `"`)
				},
			},
			play_action: {
				label: 'Content Play',
				options: genericOption,
				callback: (e) => {
					this.sendCommand(`LBC_PLAYCONTENT "` + e.options.content.replace(/"/g, '\\"') + `"`)
				},
			},
			resume_action: {
				label: 'Content Resume',
				options: genericOption,
				callback: (e) => {
					this.sendCommand(`LBC_RESUMECONTENT "` + e.options.content.replace(/"/g, '\\"') + `"`)
				},
			},
			pause_action: {
				label: 'Content Pause',
				options: genericOption,
				callback: (e) => {
					this.sendCommand(`LBC_PAUSECONTENT "` + e.options.content.replace(/"/g, '\\"') + `"`)
				},
			},
			stop_action: {
				label: 'Content Stop',
				options: genericOption,
				callback: (e) => {
					this.sendCommand(`LBC_STOPCONTENT "` + e.options.content.replace(/"/g, '\\"') + `"`)
				},
			},
			stopall_action: {
				label: 'Stop all contents',
				callback: (e) => {
					this.sendCommand(`LBC_STOPALL`)
				},
			},
			gotofm_action: {
				label: 'Content goto FrameMarker',
				options: [
					{
						type: 'textinput',
						label: 'Content Name',
						id: 'content',
						regex: this.REGEX_SOMETHING,
					},
					{
						type: 'textinput',
						label: 'FrameMarker Name',
						id: 'framemarker',
						regex: this.REGEX_SOMETHING,
					},
				],
				callback: (e) => {
					this.sendCommand(
						`LBC_GOTO_FRAMEMARKER "` +
							e.options.content.replace(/"/g, '\\"') +
							`" "` +
							e.option.framemarker.replace(/"/g, '\\"') +
							`"`
					)
				},
			},
			gotonextfm_action: {
				label: 'Content next FrameMarker',
				options: genericOption,
				callback: (e) => {
					this.sendCommand(`LBC_GOTO_NEXT_FRAMEMARKER "` + e.options.content.replace(/"/g, '\\"') + `"`)
				},
			},
			gotoprevfm_action: {
				label: 'Content previous FrameMarker',
				options: genericOption,
				callback: (e) => {
					this.sendCommand(`LBC_GOTO_PREVIOUS_FRAMEMARKER "` + e.options.content.replace(/"/g, '\\"') + `"`)
				},
			},
			command_action: {
				label: 'Execute command',
				options: [
					{
						type: 'textinput',
						label: 'Command',
						id: 'command',
						regex: this.REGEX_SOMETHING,
					},
				],
				callback: (e) => {
					this.sendCommand(e.options.command)
				},
			},
		})
	}

	/**
	 * Unhandled actions
	 * @param {any} action
	 */
	action(action) {
		this.log('error', 'action unhandled ' + JSON.stringify(action))
	}

	/**
	 * Set instance feedbacks
	 */
	initFeedbacks() {
		this.setFeedbackDefinitions({
			stopped_content: {
				type: 'boolean',
				label: 'Content stopped',
				description: 'Content stopped',
				style: {
					bgcolor: this.rgb(0, 0, 0),
				},
				options: [
					{
						type: 'textinput',
						label: 'Content name',
						id: 'content',
						default: '',
					},
				],
				callback: (feedback) => {
					let status = this.getLBContent(feedback.options.content).status
					return status == this.contentStatus.STOPPED
				},
			},
			paused_content: {
				type: 'boolean',
				label: 'Content paused',
				description: 'Content paused',
				style: {
					bgcolor: this.rgb(255, 255, 0),
					color: this.rgb(0, 0, 0),
				},
				options: [
					{
						type: 'textinput',
						label: 'Content name',
						id: 'content',
						default: '',
					},
				],
				callback: (feedback) => {
					let status = this.getLBContent(feedback.options.content).status
					return status == this.contentStatus.PAUSED
				},
			},
			playing_content: {
				type: 'boolean',
				label: 'Content playing',
				description: 'Content playing',
				style: {
					bgcolor: this.rgb(255, 140, 0),
				},
				options: [
					{
						type: 'textinput',
						label: 'Content name',
						id: 'content',
						default: '',
					},
				],
				callback: (feedback) => {
					let status = this.getLBContent(feedback.options.content).status
					return status == this.contentStatus.PLAYING
				},
			},
		})
	}

	/**
	 * Unhandled feedbacks call this method
	 * @param {any} feedback
	 */
	feedback(feedback) {
		this.log('error', 'feedback unhandled ' + JSON.stringify(feedback))
	}

	/**
	 * Initialize comunication with ClassX LiveBoard from comm and event ports
	 */
	initTCP() {
		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.port === undefined) this.config.port = 301

		if (this.config.eventport === undefined) this.config.eventport = 401

		if (this.config.host) {
			this.socket = new tcp(this.config.host, this.config.port)

			this.socket.on('status_change', (status, message) => {
				this.status(status, message)
			})

			this.socket.on('error', (err) => {
				this.debug('Network error', err)
				this.log('error', 'Network error: ' + err.message)
			})

			this.socket.on('data', this.tcpDataProcessor.bind(this))

			this.socket.on('connect', () => {
				this.debug('Connected')
				setTimeout(this.queryPresets.bind(this), 50)
			})

			this.eventsocket = new tcp(this.config.host, this.config.eventport)

			this.eventsocket.on('error', (err) => {
				this.log('error', 'Network error: ' + err.message)
			})

			this.eventsocket.on('data', this.tcpDataProcessor.bind(this))
		}
	}

	/**
	 * Query contents from LiveBoard and prepare a bank of presets
	 */
	queryPresets() {
		this.sendCommand(`LBC_GETCONTENTS`, (data) => {
			let presets = []

			if (data.toString().trim() != '')
				data
					.toString()
					.split('\r')
					.forEach((item) => {
						let contentname = item.split(',')[0].replace(/(^"|"$)/g, '')

						presets.push({
							category: 'Contents',
							label: contentname,
							bank: {
								style: 'text',
								text: contentname,
								size: '14',
								color: this.rgb(255, 255, 255),
							},
							actions: [
								{
									action: 'tap_action',
									options: {
										content: contentname,
									},
								},
							],
							feedbacks: [
								{
									type: 'stopped_content',
									style: {
										bgcolor: this.rgb(0, 0, 0),
									},
									options: {
										content: contentname,
									},
								},
								{
									type: 'paused_content',
									style: {
										bgcolor: this.rgb(255, 255, 0),
										color: this.rgb(0, 0, 0),
									},
									options: {
										content: contentname,
									},
								},
								{
									type: 'playing_content',
									style: {
										bgcolor: this.rgb(255, 140, 0),
									},
									options: {
										content: contentname,
									},
								},
							],
						})
					})

			this.setPresetDefinitions(presets)
		})
	}

	/**
	 * Process data recived by ClassX LiveBoard instances
	 * @param {any} data data recieved
	 */
	tcpDataProcessor(tcpdata) {
		tcpdata
			.toString()
			.split('\n')
			.forEach((data) => {
				if (data.trim() == '') return

				if (this.config.protocollog) this.log('debug', 'Network recv: ' + data)

				if (data.includes('Welcome to LiveBoard')) return
				if (data.toString().trim().startsWith('PING')) return
				if (data.toString().trim().startsWith('Ok')) return

				if (data.toString().trim().startsWith('SERVEREVENT')) {
					let type = parseInt(this.getQueryVariable(data.toString(), 'TYPE'))
					let contentname = this.getQueryVariable(data.toString(), 'ID')
					let content = this.getLBContent(contentname)

					switch (type) {
						case this.contentStatus.ET_ADDCLIENT:
						case this.contentStatus.ET_REMOVECLIENT:
							{
								this.queryPresets()
							}
							break
						case this.contentStatus.ET_SUSPENDCLIENT:
							//case this.contentStatus.ET_SUSPEND:
							//case this.contentStatus.ET_SUSPENDINGCLIENT:
							{
								content.status = this.contentStatus.STOPPED
							}
							break
						case this.contentStatus.ET_CLIENT_PAUSED_ON:
							{
								content.status = this.contentStatus.PAUSED
							}
							break
						case this.contentStatus.ET_CLIENT_PAUSED_OFF:
						case this.contentStatus.ET_RESUMECLIENT:
						case this.contentStatus.ET_RESUME:
							{
								content.status = this.contentStatus.PLAYING
							}
							break
					}
					this.checkFeedbacks('stopped_content', 'paused_content', 'playing_content')
					return
				}

				if (this.dataCallback.length > 0) {
					this.dataCallback.shift()(data)
					return
				}

				this.log('error', 'Network unhandled recv: ' + data)
			})
	}

	/**
	 * Util to read parameters from event port
	 * @param {any} query event body
	 * @param {any} variable key to return
	 */
	getQueryVariable(query, variable) {
		var vars = query.split(' ' + variable + '=')
		if (vars.length > 1)
			if (vars[1].startsWith('"')) return vars[1].split('" ')[0].substring(1)
			else return vars[1].split(' ')[0]
		return null
	}

	/**
	 * Send command to ClassX Liveboard instance
	 * @param {any} cmd coomand to execute
	 * @param {any} cb optional, data callback to execute in response to command
	 */
	sendCommand(cmd, cb) {
		if (cmd !== undefined && cmd != '') {
			if (this.socket !== undefined && this.socket.connected) {
				if (cb) this.dataCallback.push(cb)
				this.socket.send(cmd + '\r\n')
			}
		}
	}

	/**
	 * Store a content by name and return its saved parameters
	 * @param {any} name Content name
	 */
	getLBContent(name) {
		if (!!name) {
			name = btoa(name)
			if (this.lbContents[name] == null) this.lbContents[name] = { status: this.contentStatus.STOPPED }
			return this.lbContents[name]
		} else return { status: this.contentStatus.STOPPED }
	}

	/**
	 * Reload instance config object
	 * @param {any} config new configuration object
	 */
	updateConfig(config) {
		let resetConnection = false

		if (this.config.host != config.host) resetConnection = true

		this.config = config

		if (resetConnection === true || this.socket === undefined) this.initTCP()
	}
}

exports = module.exports = ClassXLiveBoard
