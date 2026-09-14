import fs from "fs";

export class FileReader {

    read(filePath) {

        try {

            const content = fs.readFileSync(filePath, "utf8");

            const stats = fs.statSync(filePath);

            return {

                success: true,

                path: filePath,

                content,

                size: stats.size,

                lines: content.split("\n").length,

                extension: filePath.split(".").pop()

            };

        } catch (error) {

            return {

                success: false,

                path: filePath,

                error: error.message

            };

        }

    }

    readMany(files = []) {

        return files.map(file => this.read(file));

    }

}
