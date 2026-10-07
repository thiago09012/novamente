import { buildStressSeed } from '../src/db/seed';

const totalNotes = Number(process.argv[2] ?? '5000');
const rootCount = Number(process.argv[3] ?? '5');

const seed = buildStressSeed(totalNotes, rootCount);
console.log(
  JSON.stringify(
    {
      totalNotes: seed.count,
      categories: seed.rootIds.length,
      roots: seed.rootIds.length,
      links: seed.links.length,
      firstRoot: seed.rootIds[0],
      lastRoot: seed.rootIds[seed.rootIds.length - 1],
    },
    null,
    2,
  ),
);
