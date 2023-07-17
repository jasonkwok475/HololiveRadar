class functions {
  /**
   * Capitalizes the first character
   * @param {string} text 
   * @returns {string} 
   */
  static capitalize(text) {
    if (!text) return console.log(new Error("Text was not provided."));
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Capitalizes the first character of every word
   * @param {string} text 
   * @returns {string} 
   */
  static capitalizeAll(text) {
    if (!text) return console.log(new Error("Text was not provided."));
    let words = text.split(" "), string = "";
    for (let word of words) {
      string = string + word.charAt(0).toUpperCase() + word.slice(1) + " ";
    }
    return string;
  }

  /**
   * Get a nice progress bar
   * @param {number} value Current value
   * @param {number} maxValue Max value
   * @param {number} size Length of the returned progress bar string
   * @param {boolean} percent Whether to show the percentage
   * @returns {string} Progress bar
   */
  static progressBar(value, maxValue, size, percent) {
    const percentage = value / maxValue; // Calculate the percentage of the bar
    const progress = Math.round((size * percentage)); // Calculate the number of square caracters to fill the progress side.
    const emptyProgress = size - progress; // Calculate the number of dash caracters to fill the empty progress side.

    const progressText = '▇'.repeat(progress); // Repeat is creating a string with progress * caracters in it
    const emptyProgressText = '──'.repeat(emptyProgress); // Repeat is creating a string with empty progress * caracters in it
    const percentageText = Math.round(percentage * 100) + '%'; // Displaying the percentage of the bar

    return percent ? '```[' + progressText + emptyProgressText + '] ' + percentageText + '```' : '[' + progressText + emptyProgressText + ']';
  }

  /**
   * Get a formatted time string in UTC from milliseconds.
   * @param {string|integer} millis 
   * @returns {string} hh:mm:ss UTC
   */
  static getTime(millis) {
    let d = new Date(millis);
    let datehour = d.getUTCHours();
    let datemin = d.getUTCMinutes();
    let datesec = d.getUTCSeconds();
    if (datehour < 10) datehour = `0${datehour}`;
    if (datemin < 10) datemin = `0${datemin}`;
    if (datesec < 10) datesec = `0${datesec}`;

    return `${datehour}:${datemin}:${datesec} UTC`;
  }

  /**
   * Get a formatted date-time string in UTC
   * @param {string|integer} [millis] Optional to get specific time from milliseconds
   * @returns {string} dd/mm/yyyy hh:mm:ss UTC
   */
  static newDate(millis) {
    let d = new Date(millis || Date.now());
    let datem = d.getUTCMonth()
    let datemonth = datem += 1;
    let dateday = d.getUTCDate();
    let dateyear = d.getUTCFullYear();
    let datehour = d.getUTCHours();
    let datemin = d.getUTCMinutes();
    let datesec = d.getUTCSeconds();

    if (datemonth < 10) datemonth = `0${datemonth}`;
    if (dateday < 10) dateday = `0${dateday}`;
    if (datehour < 10) datehour = `0${datehour}`;
    if (datemin < 10) datemin = `0${datemin}`;
    if (datesec < 10) datesec = `0${datesec}`;

    return `${dateday}/${datemonth}/${dateyear} ${datehour}:${datemin}:${datesec} UTC`;
  }

  /**
   * Adds a character to every 3 numbers. <br>
   * Ex. 358912 -> 358.912
   * @param {string|integer} num 
   * @param {string} character Character to add to every 3 numbers
   * @returns {string} Formatted number
   */
  static formatNumber(num, character) {
    return !num ? 0 : parseInt(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, character);
  }

  /**
   * Convert an amount of youtube subscribers into a formatted string
   * @param {(number|string)} sub Youtube subscribers
   * @returns {string} Formatted subscriber string - Ex. 2.12m
   */
  static subscriberString(sub) {
    if (parseInt(sub) == 0) return "-";
    let final, subs = parseInt(sub);
    let string = this.formatNumber(subs, ".");
    let num = 4;
    if ((subs > 999) && (subs < 1000000)) {
      if (subs.toString().length == 6) num = 3;
      final = string.substring(0, num) + "k";
    } else if ((subs > 999999) && (subs < 1000000000)) {
      if (subs.toString().length == 9) num = 3;
      final = string.substring(0, num) + "m";
    } else if (subs <= 999) {
      final = string.substring(0, 3);
    } else if (subs > 999999999) {
      if (subs.toString().length == 12) num = 3;
      final = string.substring(0, num) + "b"
    }
    return final;
  }

  static monthDiff(d1, d2) {
    var months;
    months = (d2.getFullYear() - d1.getFullYear()) * 12;
    months -= d1.getMonth();
    months += d2.getMonth();
    return months <= 0 ? 0 : months;
  }

  static weightedRandom(spec) {
    //!Make sure you understand how this works
    var i, sum = 0, r = Math.random();
    for (i in spec) {
      sum += spec[i];
      if (r <= sum) return i;
    }
  }
}

module.exports = functions;