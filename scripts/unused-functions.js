
// async getVideos() {
//   return;

//   //!TEMP
//   //For now, just try it with two topic channels. to make sure it works
//   let channels = await database.getAllMembers();
//   let string = "", videos = [];

//   for await (let channel of channels) {
//     console.log("-----");
//     await getChannelVideos({ id: channel.topic, num: channel.id });
//   }

//   console.log("Inserting....");
//   videos.sort((a, b) => new Date(a.snippet.publishedAt) - new Date(b.snippet.publishedAt));
//   await database.query("SET character_set_results = 'utf8mb4', character_set_client = 'utf8mb4', character_set_connection = 'utf8mb4', character_set_database = 'utf8mb4', character_set_server = 'utf8mb4'");
//   for await (let video of videos) {
//     let ch = channels.filter(x => x.topic == video.snippet.channelId)[0];
//     if (video.snippet.title.toLowerCase().includes("instrumental")) continue;
//     if (!video.snippet.channelTitle.toLowerCase().includes("topic")) continue;
//     await database.query(`INSERT INTO \`music_topic\` (\`video_id\`, \`title\`, \`channel\`) VALUES ('${video.id.videoId}', '${video.snippet.title.replace("'", "\\'")}', '${ch.id}')`).catch(e => console.error(e));
//   }
//   console.log("Done!");

//   // console.log("Inserting into database...");
//   // await database.query("SET character_set_results = 'utf8mb4', character_set_client = 'utf8mb4', character_set_connection = 'utf8mb4', character_set_database = 'utf8mb4', character_set_server = 'utf8mb4'");
//   // await database.query(`UPDATE music_topic m JOIN (${string}) vals ON m.video_id = vals.id SET channel = ch, title = t`).catch(e => this.log.error(e));
//   // console.log("Done!");
//   // console.log(`UPDATE music_topic m JOIN (${string}) vals ON m.video_id = vals.id SET channel = ch, title = t`);

//   function getChannelVideos({ id, num, page }) {
//     return new Promise(async (resolve, reject) => {
//       console.log("Getting videos for num " + num);
//       if (!id || id == null) {
//         console.log("No topic ID for " + num);
//         return resolve();
//       }
//       let params = {
//         auth: process.env.youtube_key,
//         part: 'snippet',
//         channelId: id,
//         type: "video",
//         maxResults: 50
//       }
//       if (page) params.pageToken = page;
//       await google.youtube('v3').search.list(params).then(async r => {
//         database.addYoutubeRequestCount(100);
//         if ((r.status !== 200) || (r.statusText !== "OK")) return f.log(client, `Error while requesting video data: \`\`\`${r.status} ${r.errors[0].message}: ${r.errors[0].reason}\`\`\``, "error")

//         videos.push(...r.data.items);

//         if (r.data.nextPageToken !== undefined) {
//           setTimeout(async () => {
//             await getChannelVideos({ id, num, page: r.data.nextPageToken });
//             resolve();
//           });
//         } else resolve();
//       });
//     });
//   }
// }