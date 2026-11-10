// Generates samples/project-brief.docx (headings + bold/italic/underline) for trying the importer.
// Usage: node scripts/make-sample-docx.mjs
import { writeFileSync } from "node:fs";
import JSZip from "jszip";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const style = (id, name, size) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
const para = (runs, styleId) =>
  `<w:p>${styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : ""}${runs}</w:p>`;
const run = (text, fmt = "") => `<w:r>${fmt ? `<w:rPr>${fmt}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;

const body = [
  para(run("Project brief: ColabDocs"), "Heading1"),
  para(run("Goal", ""), "Heading2"),
  para(run("Give teams a ") + run("fast", "<w:b/>") + run(", ") + run("simple", "<w:i/>") + run(" place to write and share documents.")),
  para(run("Scope"), "Heading2"),
  para(run("In scope: ", "<w:b/>") + run("rich-text editing, file import, sharing with roles.")),
  para(run("Out of scope: ", "<w:b/>") + run("real-time co-editing, comments, offline mode.", "<w:u w:val=\"single\"/>")),
].join("");

const zip = new JSZip();
zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}>${style("Heading1", "heading 1", 40)}${style("Heading2", "heading 2", 32)}</w:styles>`);
zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`);

writeFileSync(new URL("../samples/project-brief.docx", import.meta.url), await zip.generateAsync({ type: "nodebuffer" }));
console.log("Wrote samples/project-brief.docx");
