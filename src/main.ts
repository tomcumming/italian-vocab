import { parseString as parseXmlString } from 'xml2js';
import * as fs from 'fs';
import * as readline from 'readline';

function asPronounced(word: string): string {
    return word.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
}

function parseDict(path: string): Promise<{ [word: string]: [string, string[]][] }> {
    return new Promise((res, rej) => {
        const dictString = fs.readFileSync(
            path,
            'utf8'
        );

        parseXmlString(
            dictString,
            (err, result) =>
            {
                if(err)
                    rej(err);

                let translated: { [word: string]: [string, string[]][] } = {};

                const entryNodes = result.TEI.text[0].body[0].entry;

                for(const entryNode of entryNodes) {
                    const itWord: string = entryNode.form[0].orth[0];
                    const translations = entryNode.sense
                        .map((sense: any) => {
                            const defs = sense.cit
                                .flatMap((cit: any) => cit.quote);
                            return [itWord, defs];
                        });

                    const pro = asPronounced(itWord);

                    if(translated[pro])
                        translated[pro] =
                            translated[pro].concat(translations);
                    else
                        translated[pro] = translations;
                }

                res(translated);
            }
        );
    });
}

function openFrequencyList(path: string): readline.Interface {
    const fileStream = fs.createReadStream(path);

    return readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
}

function stripQuotes(input: string): string {
    return input.substr(1, input.length - 2);
}


async function start() {
    const frequencyPath = process.argv[2];
    const dictPath = process.argv[3];

    const dict = await parseDict(dictPath);
    const iter = openFrequencyList(frequencyPath);

    const outStream = fs.openSync('dist/italian-vocab.tsv', 'w');
    fs.writeSync(outStream, "Frequency Rank\tItalian\tEnglish");

    let covered = new Set<string>();

    let first = true;
    for await(const line of iter) {
        if(first) {
            first = false;
            continue;
        }

        const parts = line.split(','); // lets hope this is enough ;)
        const freq = parseInt(stripQuotes(parts[0]));
        const italian = stripQuotes(parts[1]);
        const pro = asPronounced(italian);
        if(covered.has(pro))
            continue;
        else
            covered.add(pro);

        const entry = dict[pro];
        if(entry !== undefined) {
            const entries = entry
                .map(e => `${e[0]}: ${e[1].join(', ')}`)
                .join('\n');
            fs.writeSync(outStream, `\n"${freq}"\t"${italian}"\t"${entries}"`);
        }
    }

    fs.closeSync(outStream);
}

start();
