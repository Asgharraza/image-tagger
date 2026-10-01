const { z } = require('zod');

const TagOutput = z.object({
  tags: z.array(z.string().min(1).max(30)).min(1).max(10)
});

module.exports = { TagOutput };