import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { writeFileSync } from "fs";

async function generateKeys() {
  try {
    const keys = await generateKeyPair("RS256", { extractable: true });
    const privateKey = await exportPKCS8(keys.privateKey);
    const publicKey = await exportJWK(keys.publicKey);
    const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

    const output = `JWT_PRIVATE_KEY="${privateKey.trimEnd().replace(/\n/g, " ")}"
JWKS=${jwks}\n`;
    process.stdout.write(output);
    writeFileSync("jwt_keys.txt", output);
    console.log("\nKeys also written to jwt_keys.txt");
  } catch (error) {
    console.error("Error generating keys:", error);
    process.exit(1);
  }
}

generateKeys(); 