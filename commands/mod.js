const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ComponentType, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('./../config/config.json');
const fs = require("fs");
const fetch = require("node-fetch");
const database = require("../functions/database.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Shows the available moderation actions for the specified member')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('The target member')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction) {
    let guildBans = await interaction.guild.bans.fetch();
    let guildMembers = await interaction.client.guilds.cache.get(config.guildID).members.fetch();
    let options = interaction.options;
    let member = options.getUser('member');
    let gmember = guildMembers.get(member.id) || guildBans.get(member.id);
    if (!gmember) return interaction.reply({ content: "User is not banned or in the guild. Unable to fetch information.", ephemeral: true });
    let banned = gmember.reason ? true : false;
    let staff = await interaction.client.guilds.cache.get(config.guildID).members.fetch(interaction.member.id);

    let history = (await database.query(`SELECT * FROM \`moderator-log\` WHERE \`user\`='${member.id}' ORDER BY \`id\` DESC`)).results;
    let warns = history.filter(x => x.type == 0);
    let timeouts = history.filter(x => x.type == 1);
    let kicks = history.filter(x => x.type == 2);
    let bans = history.filter(x => x.type == 3);

    if (!staff.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({ content: "You do not have the correct permissions to use this.", ephemeral: true });
    }

    const modButtons = banned ? new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mod-unban-' + member.id).setLabel("Unban").setStyle('Success')
    ) : new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mod-warn-' + member.id).setLabel('Warn').setStyle('Success'),
      new ButtonBuilder().setCustomId('mod-ban-' + member.id).setLabel('Ban').setStyle('Danger'),
      new ButtonBuilder().setCustomId('mod-kick-' + member.id).setLabel('Kick').setStyle('Danger'),
    );

    let creation = new Date(member.createdAt).getTime();
    let fields = [
      { name: "Banned⠀⠀⠀⠀⠀⠀User Tag", value: `${banned ? "Yes" : "No\u202F"}⠀⠀⠀⠀⠀⠀⠀⠀⠀<@${member.id}>`, inline: false },
      { name: "Warnings", value: warns.length, inline: true },
      { name: "Timeouts", value: timeouts.length, inline: true },
      { name: "Kicks", value: kicks.length, inline: true },
      { name: "Account Created On⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀", value: `<t:${Math.round(creation / 1000)}:f> (<t:${Math.round(creation / 1000)}:R>)`, inline: false },
    ];
    if (!banned) fields.push({ name: "Joined", value: `<t:${Math.round(gmember.joinedTimestamp / 1000)}:f> (<t:${Math.round(gmember.joinedTimestamp / 1000)}:R>)`, inline: false })
    if (banned) fields.push(
      { name: "Ban Reason", value: `${gmember.reason}`, inline: true },
      { name: "Moderator", value: `<@${bans[0].moderator}>`, inline: true }
    );

    let historyString = "";
    for (let row of history.slice(0, 10)) {
      let type = row.type == 0 ? "Warning" : row.type == 1 ? "Timeout" : row.type == 2 ? "Kicked" : "Banned";
      historyString = historyString + `\n**${type}**: ${row.reason} - <t:${new Date(row.timestamp).getTime() / 1000}:D>`;
    }
    if (historyString == "") historyString = "None.";

    if (!banned) {
      if (gmember.isCommunicationDisabled()) {
        modButtons.addComponents(new ButtonBuilder().setCustomId('mod-timeout').setLabel('Timeout').setStyle('Primary').setDisabled(true));
        fields.push({ name: "Note:", value: `Currently in timeout until <t:${Math.round(gmember.communicationDisabledUntilTimestamp / 1000)}:f>`, inline: false });
      } else {
        modButtons.addComponents(new ButtonBuilder().setCustomId('mod-timeout-' + member.id).setLabel('Timeout').setStyle('Primary'));
      }
    }

    let modEmbed = {
      color: config.informationEmbedColor,
      title: member.username + "#" + member.discriminator,
      fields: fields,
      thumbnail: { url: member.avatarURL() }
    }

    interaction.reply({ embeds: [modEmbed], components: [await createDropdown("details"), modButtons] }).then(msg => {
      let collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300000 });

      collector.on("collect", async i => {
        if (i.member.id !== interaction.member.id) {
          return i.reply({ content: "You are not allowed to interact with an interaction that is not yours.", ephemeral: true });
        }

        i.deferUpdate();
        let embed;

        if (i.values[0] == "details") {
          embed = modEmbed;
        } else if (i.values[0] == "history") {
          embed = {
            color: config.informationEmbedColor,
            title: "Infraction History (Limit: 10)",
            description: historyString,
            footer: { text: member.username + "#" + member.discriminator }
          }
        }

        let comp = [await createDropdown(i.values[0]), i.message.components[1]];
        interaction.editReply({ embeds: [embed], components: comp });
      });

      collector.on("end", collected => interaction.editReply({ embeds: msg.embeds, components: [] }));
    });

    function createDropdown(page) {
      return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('modview').addOptions(
          {
            label: "Member Details",
            description: "Details about the discord member",
            value: "details",
            default: page == "details" ? true : false
          },
          {
            label: "Infraction History",
            description: "Member's history of infractions",
            value: "history",
            default: page == "history" ? true : false
          }
        )
      );
    }
  },
};