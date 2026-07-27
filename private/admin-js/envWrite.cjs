const fs = require("fs");

function updateEnvValue(key, newValue) {
    const envPath = ".env";
    let env = fs.readFileSync(envPath, "utf8");

    // Escape special regex characters in the key
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Matches:
    // KEY=value
    // KEY = value
    // KEY    =    value
    const regex = new RegExp(
        `^(\\s*${escapedKey}\\s*=\\s*).*?$`,
        "m"
    );

    if (regex.test(env)) {
        // Preserve the original spacing before/around the "="
        env = env.replace(regex, `$1'${newValue}'`);
    } else {
        // Add the variable if it doesn't already exist
        if (env.length > 0 && !env.endsWith("\n")) {
            env += "\n";
        }
        env += `${key}='${newValue}'\n`;
    }

    fs.writeFileSync(envPath, env);

    // Update the currently running process too
    process.env[key] = String(newValue);
}


module.exports = { updateEnvValue };