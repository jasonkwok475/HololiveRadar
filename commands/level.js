const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const fetch = require("node-fetch");
const config = require("../config/config.json");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
const database = require("../functions/database.js");
const f = require('../scripts/functions.js');
const { createCanvas, loadCanvas, loadImage } = require("canvas");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Show your server level')
    .addUserOption(option => 
      option.setName("user")
        .setDescription("(Optional) The user to request a level card for")),
  async execute(interaction) {
    await interaction.deferReply();

    let reqMember = interaction.options.getUser('user') || interaction.member;

    let allUsers = (await database.query(`SELECT * FROM \`members\` ORDER BY \`xp\` DESC, \`counter\` ASC`)).results;
    let rank = allUsers.findIndex(x => x.id == reqMember.id) + 1;
    let user = [...allUsers].filter(x => x.id == reqMember.id)[0];
    let member = (await interaction.client.guilds.cache.get(config.guildID).members.fetch(reqMember.id)).user;

    await interaction.editReply({ files: [new AttachmentBuilder(await generateCard(member), { name: "level.png" })]})

    function generateCard(m) {
      return new Promise(async (resolve, reject) => {
        try {
          let color = "#383A40";
          let { level, xp, xpNeeded } = await interaction.client.getLevel(user.xp);
          let barWidth = 765 * (xp / xpNeeded);
          if (barWidth < 40) barWidth = 40;

          const canvas = createCanvas(1166, 344);
          const ctx = canvas.getContext('2d');
  
          let userImg = await loadImage(m.avatarURL().replace("webp", "png"));
  
          ctx.fillStyle = '#2B2D31';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.save();

          roundedBox(344, 237, 765, 40, 22.5);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.save();

          ctx.clip();
          roundedBox(344, 237, barWidth, 40, 22.5)
          ctx.fillStyle = '#27C7FF';
          ctx.fill();

          ctx.restore();
          ctx.save();

          ctx.beginPath();
          ctx.arc(172, 172, 115, 0, 2 * Math.PI);
          ctx.closePath();

          ctx.clip();
          ctx.drawImage(userImg, 57, 57, 230, 230);
          ctx.restore();
          ctx.save();

          ctx.fillStyle = "white";
          ctx.font = "38px Josefin Sans Bold";
          ctx.fillText(`${m.username}`, 354, 207);

          let discPos = ctx.measureText(m.username).width;
          ctx.restore();
          ctx.fillStyle = "grey";
          ctx.font = "28px Josefin Sans Bold";
          ctx.fillText(`#${m.discriminator}`, 354 + discPos + 10, 207);

          ctx.restore();
          ctx.fillStyle = "grey";
          ctx.font = "34px Josefin Sans Bold";
          let text = `/ ${f.subscriberString(xpNeeded)} XP`, textWidth = ctx.measureText(text).width;
          ctx.fillText(text, 1166 - 57 - textWidth, 207);
          ctx.restore();
          ctx.fillStyle = "white";
          ctx.font = "34px Josefin Sans Bold";
          let text2 = `${xp == 0 ? 0 : f.subscriberString(xp)}`, textWidth2 = ctx.measureText(text2).width;
          ctx.fillText(text2, 1166 - 57 - textWidth - textWidth2 - 10, 207);
    
          ctx.restore();
          ctx.fillStyle = "#27C7FF";
          ctx.font = "50px Josefin Sans Bold";
          let lvl = ctx.measureText(level);
          ctx.textBaseline = "top";
          ctx.fillText(level, 1166 - 57 - lvl.width, 57);
          ctx.restore();

          ctx.fillStyle = "grey";
          ctx.font = "28px Josefin Sans Bold";
          ctx.textBaseline = "top";
          let lvlText = ctx.measureText("Level");
          ctx.fillText("Level", 1166 - 57 - lvl.width - 12 - lvlText.width, 57 + 20);

          ctx.restore();
          ctx.fillStyle = "#27C7FF";
          ctx.font = "50px Josefin Sans Bold";
          let r = ctx.measureText(`#${rank}`);
          ctx.textBaseline = "top";
          ctx.fillText(`#${rank}`, 1166 - 57 - lvl.width - 12 - lvlText.width - 35 - r.width, 57);
          ctx.restore();

          ctx.fillStyle = "grey";
          ctx.font = "28px Josefin Sans Bold";
          ctx.textBaseline = "top";
          let rText = ctx.measureText("Rank");
          ctx.fillText("Rank", 1166 - 57 - lvl.width - 12 - lvlText.width - 35 - r.width - 12 - rText.width, 57 + 20);

          // const canvas2 = createCanvas(1280, 458);
          // const ctx2 = canvas2.getContext('2d');

          // ctx2.fillStyle = '#383A40';
          // ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
          // ctx2.save();
          // ctx2.drawImage(canvas, 57, 57);

          return resolve(canvas.toBuffer());

          function roundedBox(x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
          }
        } catch (e) { console.error(e); return reject(e); }
      });
    }
  }
}