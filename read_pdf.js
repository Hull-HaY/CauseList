const { PdfReader } = require("pdfreader");
const fs = require('fs');

let fullText = [];

new PdfReader().parseFileItems("../Nairobi_16042026_124940.pdf", (err, item) => {
  if (err) console.error("error:", err);
  else if (!item) {
      fs.writeFileSync("pdf_text_utf8.txt", fullText.join("\n"));
      console.warn("end of file");
  }
  else if (item.text) {
      fullText.push(item.x + "," + item.y + ": " + item.text);
  }
});
