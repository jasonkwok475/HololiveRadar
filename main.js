const Client = require("./structures/client.js");
const client = new Client();
require("dotenv").config();

client.init(process.env.TOKEN);