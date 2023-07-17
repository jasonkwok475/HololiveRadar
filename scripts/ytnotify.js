const EventEmitter = require("events");
const fetch = require("node-fetch");

const base_topic = 'https://www.youtube.com/xml/feeds/videos.xml?channel_id=';
const hubUrl = 'https://pubsubhubbub.appspot.com/';

/**
 * @class
 * @classdesc Module to interact with Youtube PubSubHubBub
 */
class YTNotify extends EventEmitter {
  options = {};

  constructor(options={}) { 
    if (!options.hubCallback) throw new Error('You need to provide the callback URL.');
    super();

    this.hubCallback = options.hubCallback;
  }

  subscribe(channels) {
    //!Change this later to check for an object { name: "", id: xxxxx }
    //if (!channels || (typeof channels !== 'string' && !Array.isArray(channels))) {
    //  throw new Error('You need to provide a channel id or an array of channel ids.',);
    //}
    //if (typeof channels === 'string') {
      this._makeRequest(channels, 'subscribe', 'link_id');
      this._makeRequest(channels, 'subscribe', 'topic');
    //} else {
    //  channels.forEach(channel => this._makeRequest(channel, 'subscribe'));
    //}
  }

  unsubscribe(channels) {
    //if (!channels || (typeof channels !== 'string' && !Array.isArray(channels))) {
    //  throw new Error('You need to provide a channel id or an array of channel ids.',);
    //}
    //if (typeof channels === 'string') {
      this._makeRequest(channels, 'unsubscribe');
    //} else {
    //  channels.forEach(channel => this._makeRequest(channel, 'unsubscribe'));
    //}
  }

  async _makeRequest(channel, type, idtype="link_id") {
    let channeltype = idtype == "link_id" ? "normal" : "topic";
    if (!channel[`${idtype}`] || channel[`${idtype}`] == null) return;

    const params = new URLSearchParams({
      "hub.callback": this.hubCallback,
      "hub.mode": type,
      "hub.topic": base_topic + channel[`${idtype}`],
      "hub.verify": "async"
    });
    
    var getData = await fetch(`${hubUrl}subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': "application/x-www-form-urlencoded" },
      body: params,
      encoding: "utf-8"
    })
    var data = await getData;

    if (data.status == ("200" || "202" || "204") || data.statusText == "Accepted") {
      this.emit(type, data={ channeltype, channel: channel, response: data });
    } else {
      this.emit('failed', data={ channeltype, type: type, channel: channel, response: data });
    }
  }
  
} 

module.exports = YTNotify;