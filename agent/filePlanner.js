import path from "path";

export class FilePlanner {

    constructor(){
        this.outputFolder = "generated-project";
    }

    // A planned file name must never escape the output folder. Any name
    // carrying traversal, separators or encoding tricks is dropped so the
    // generated plan can only ever target files inside the output folder.
    _safeFileName(file) {
        if (
            typeof file !== "string" ||
            file.length === 0 ||
            file.includes("..") ||
            file.includes("\\") ||
            file.includes("\0") ||
            file.includes("%") ||
            file.startsWith("/")
        ) {
            return false;
        }
        return true;
    }

    plan(files){
        const result = [];

        for (const file in files) {
            if (!this._safeFileName(file)) {
                continue;
            }

            const newFile =
                path.join(
                    this.outputFolder,
                    file
                );

            result.push({
                action: "create",
                file: newFile,
                content: files[file]
            });
        }

        return result;
    }
}