const fs = require('fs');
const { PdfReader } = require('pdfreader');

let fullText = [];

// Parse the PDF
new PdfReader().parseFileItems("../Nairobi_16042026_124940.pdf", (err, item) => {
    if (err) console.error("error:", err);
    else if (!item) {
        processPdfLines(fullText);
    }
    else if (item.text) {
        fullText.push(item.x + "," + item.y + ": " + item.text);
    }
});

function processPdfLines(lines) {
    let date = '';
    let officer = '';
    let tribunal = '';
    let time = '';
    let category = '';

    const matters = [];
    let currentMatter = null;

    for (let line of lines) {
        const textPart = line.substring(line.indexOf(':') + 1).trim();
        if (!textPart) continue;

        if (textPart.includes('MILIMANI HIGH COURT') || textPart === 'NAIROBI' || textPart === 'CAUSE LIST') continue;
        if (textPart.startsWith('http')) continue;

        if (textPart.match(/^[A-Z]+,\s*\d{1,2}\s+[A-Z]+\s+\d{4}$/)) {
            date = textPart;
            continue;
        }

        if (textPart.includes('HON.') || textPart.includes('MR.')) {
            // Split into officer and tribunal
            const courtIndex = textPart.indexOf('COURT');
            if (courtIndex !== -1) {
                officer = textPart.substring(0, courtIndex).trim();
                tribunal = textPart.substring(courtIndex).trim();
            } else {
                officer = textPart;
            }
            continue;
        }

        if (textPart.match(/^\d{2}:\d{2}\s*[AM|PM|am|pm]+/)) {
            time = textPart;
            continue;
        }

        if (textPart === 'MENTION' || textPart === 'HEARING') {
            category = textPart;
            continue;
        }

        const matterMatch = textPart.match(/^(\d+)\.\s+(.*)/);
        if (matterMatch) {
            if (currentMatter) {
                matters.push(currentMatter);
            }
            
            let caseText = matterMatch[2].trim();
            let caseNo = '';
            let parties = caseText;
            
            // Match things like NAIROBI_RRC/783/2019 or RRC/E1097/2023
            const caseNoMatch = caseText.match(/^(.*?\/[0-9]{4})\s*(.*)/);
            if (caseNoMatch) {
                caseNo = caseNoMatch[1];
                parties = caseNoMatch[2];
            } else {
                caseNo = caseText;
                parties = '';
            }

            currentMatter = {
                date,
                officer,
                tribunal,
                time,
                category,
                id: matterMatch[1],
                caseNo,
                parties
            };
        } else {
            if (currentMatter) {
                currentMatter.parties += ' ' + textPart;
            }
        }
    }
    if (currentMatter) matters.push(currentMatter);

    fs.writeFileSync('data.json', JSON.stringify(matters, null, 2));
    console.log('Successfully extracted', matters.length, 'matters.');
}
