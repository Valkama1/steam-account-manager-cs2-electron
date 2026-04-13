// Tests for the loginusers.vdf patching logic
const os   = require("os");
const path = require("path");
const fs   = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-vdf-"));
process.env.TEST_DB_PATH  = path.join(tmpDir, "accounts.json");
process.env.TEST_KEY_PATH = path.join(tmpDir, ".key");

const { setSteamAutoLogin } = require("../index");

// A minimal loginusers.vdf with two accounts
const TARGET_ID  = "76561198000000001";
const OTHER_ID   = "76561198000000002";

const VDF_TEMPLATE = `\
"users"
{
\t"${TARGET_ID}"
\t{
\t\t"AccountName"\t\t"targetuser"
\t\t"PersonaName"\t\t"Target"
\t\t"RememberPassword"\t\t"0"
\t\t"MostRecent"\t\t"0"
\t\t"AllowAutoLogin"\t\t"0"
\t}
\t"${OTHER_ID}"
\t{
\t\t"AccountName"\t\t"otheruser"
\t\t"PersonaName"\t\t"Other"
\t\t"RememberPassword"\t\t"1"
\t\t"MostRecent"\t\t"1"
\t\t"AllowAutoLogin"\t\t"1"
\t}
}
`;

let steamDir;

beforeEach(() => {
  steamDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-steam-"));
  fs.mkdirSync(path.join(steamDir, "config"));
  fs.writeFileSync(path.join(steamDir, "config", "loginusers.vdf"), VDF_TEMPLATE);
});

afterEach(() => fs.rmSync(steamDir, { recursive: true, force: true }));
afterAll(()  => fs.rmSync(tmpDir,   { recursive: true, force: true }));

describe("setSteamAutoLogin", () => {
  test("returns false when loginusers.vdf does not exist", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-empty-"));
    fs.mkdirSync(path.join(emptyDir, "config"));
    expect(setSteamAutoLogin(emptyDir, TARGET_ID)).toBe(false);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  test("returns false when steamId64 is not in the vdf", () => {
    expect(setSteamAutoLogin(steamDir, "76561198999999999")).toBe(false);
  });

  test("returns true when steamId64 is present", () => {
    expect(setSteamAutoLogin(steamDir, TARGET_ID)).toBe(true);
  });

  test("sets AllowAutoLogin=1 and RememberPassword=1 for the target", () => {
    setSteamAutoLogin(steamDir, TARGET_ID);
    const updated = fs.readFileSync(path.join(steamDir, "config", "loginusers.vdf"), "utf8");

    // Find the target block and verify flags
    const targetIdx = updated.indexOf(`"${TARGET_ID}"`);
    const afterTarget = updated.slice(targetIdx);
    const blockEnd = afterTarget.indexOf("}");
    const block = afterTarget.slice(0, blockEnd);

    expect(block).toMatch(/"AllowAutoLogin"\s+"1"/);
    expect(block).toMatch(/"RememberPassword"\s+"1"/);
    expect(block).toMatch(/"MostRecent"\s+"1"/);
  });

  test("clears AllowAutoLogin and RememberPassword for all other accounts", () => {
    setSteamAutoLogin(steamDir, TARGET_ID);
    const updated = fs.readFileSync(path.join(steamDir, "config", "loginusers.vdf"), "utf8");

    const otherIdx = updated.indexOf(`"${OTHER_ID}"`);
    const afterOther = updated.slice(otherIdx);
    const blockEnd = afterOther.indexOf("}");
    const block = afterOther.slice(0, blockEnd);

    expect(block).toMatch(/"AllowAutoLogin"\s+"0"/);
    expect(block).toMatch(/"RememberPassword"\s+"0"/);
    expect(block).toMatch(/"MostRecent"\s+"0"/);
  });

  test("adds AllowAutoLogin field if it was missing from the target block", () => {
    // Write a vdf without AllowAutoLogin on the target
    const vdfNoField = VDF_TEMPLATE.replace(`\t\t"AllowAutoLogin"\t\t"0"\n`, "");
    fs.writeFileSync(path.join(steamDir, "config", "loginusers.vdf"), vdfNoField);

    setSteamAutoLogin(steamDir, TARGET_ID);
    const updated = fs.readFileSync(path.join(steamDir, "config", "loginusers.vdf"), "utf8");
    expect(updated).toMatch(/"AllowAutoLogin"\s+"1"/);
  });
});
