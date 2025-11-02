import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getRootPath() {
    // 从当前目录开始向上查找 package.json
    let current = __dirname;
    while (!fs.existsSync(path.join(current, "package.json"))) {
        const parent = path.resolve(current, "..");
        if (parent === current) throw new Error("找不到项目根目录！");
        current = parent;
    }
    return current;
}
