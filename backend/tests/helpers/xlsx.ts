import { crc32 } from "node:zlib";

export type Cell = string | number | null;

export interface SheetSpec {
    name: string;
    rows: Cell[][];
}

const XML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
};

function escapeXml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

function columnLetter(index: number): string {
    let letters = "";
    let value = index + 1;
    while (value > 0) {
        const remainder = (value - 1) % 26;
        letters = String.fromCharCode(65 + remainder) + letters;
        value = Math.floor((value - 1) / 26);
    }
    return letters;
}

function sheetXml(rows: Cell[][]): string {
    const body = rows
        .map((cells, rowIndex) => {
            const refs = cells
                .map((cell, columnIndex) => {
                    if (cell === null || cell === undefined || cell === "") return "";
                    const ref = `${columnLetter(columnIndex)}${rowIndex + 1}`;
                    return typeof cell === "number"
                        ? `<c r="${ref}"><v>${cell}</v></c>`
                        : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
                              String(cell)
                          )}</t></is></c>`;
                })
                .join("");
            return refs === "" ? "" : `<row r="${rowIndex + 1}">${refs}</row>`;
        })
        .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function zip(entries: Array<{ name: string; data: Buffer }>): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;

    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, "utf8");
        const checksum = crc32(data) >>> 0;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); 
        local.writeUInt16LE(20, 4);         
        local.writeUInt16LE(0, 6);          
        local.writeUInt16LE(0, 8);          
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(data.length, 18); 
        local.writeUInt32LE(data.length, 22); 
        local.writeUInt16LE(nameBuf.length, 26);
        locals.push(local, nameBuf, data);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); 
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);    
        centrals.push(Buffer.concat([central, nameBuf]));

        offset += local.length + nameBuf.length + data.length;
    }

    const centralDirectory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);        
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...locals, centralDirectory, end]);
}

export function buildXlsx(sheets: SheetSpec[]): Buffer {
    const overrides = sheets
        .map(
            (_sheet, index) =>
                `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join("");

    const sheetEntries = sheets
        .map(
            (sheet, index) =>
                `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
        )
        .join("");

    const relationships = sheets
        .map(
            (_sheet, index) =>
                `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
        )
        .join("");

    const entries: Array<{ name: string; data: Buffer }> = [
        {
            name: "[Content_Types].xml",
            data: Buffer.from(
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`,
                "utf8"
            )
        },
        {
            name: "_rels/.rels",
            data: Buffer.from(
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
                "utf8"
            )
        },
        {
            name: "xl/workbook.xml",
            data: Buffer.from(
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>`,
                "utf8"
            )
        },
        {
            name: "xl/_rels/workbook.xml.rels",
            data: Buffer.from(
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`,
                "utf8"
            )
        },
        ...sheets.map((sheet, index) => ({
            name: `xl/worksheets/sheet${index + 1}.xml`,
            data: Buffer.from(sheetXml(sheet.rows), "utf8")
        }))
    ];

    return zip(entries);
}
