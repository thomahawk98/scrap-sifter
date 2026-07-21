const encoder = {
    encodeChunkData: function (blocks) {
        const out = []; // temporary JS array

        let last = blocks[0];
        let count = 1;

        for (let i = 1; i < blocks.length; i++) {
            const value = blocks[i];

            if (value === last && count < 65535) {
                //add to run
                count++;
            } else {
                //run ended, push values
                out.push(last, count);

                //start new run
                last = value;
                count = 1;
            }
        }
        out.push(last, count);

        //return the compressed array
        return Uint16Array.from(out);
    },
    decodeChunkData: function (compressedBlocks) {
        //get total block count from every other numebr
        let total = 0;
        for (let i = 1; i < compressedBlocks.length; i += 2) {
            total += compressedBlocks[i];
        }

        // new output array (use the total value)
        const blocks = new Uint16Array(total);

        // expand the runs
        let offset = 0;
        for (let i = 0; i < compressedBlocks.length; i += 2) {
            const value = compressedBlocks[i];
            const count = compressedBlocks[i + 1];

            blocks.fill(value, offset, offset + count);
            offset += count;
        }

        return blocks;
    },
}

export default encoder;