export class DiffEngine {

    create(original = "", updated = "") {

        if (original === updated) {

            return {
                changed: false,
                original,
                updated
            };

        }

        return {

            changed: true,

            original,

            updated

        };

    }

    apply(original = "", diff = {}) {

        if (!diff.changed) {

            return original;

        }

        return diff.updated;

    }

}