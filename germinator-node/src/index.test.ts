import { loadFile, loadFiles } from './index';
import { withTempFiles } from './test-util';

describe('loadFile', () => {
  it('loads an empty seed file', () =>
    withTempFiles(
      {
        'seed-a.yml': `
          germinator: v2
          synchronize: false
          entities: []
        `,
      },
      async (inDir) => {
        const file = await loadFile(inDir('seed-a.yml'), {});

        expect(file.entries).toHaveLength(0);
      },
    ));
});

describe('loadFiles', () => {
  it('loads all files in a folder', () =>
    withTempFiles(
      {
        'seed-a.yml': `
          germinator: v2
          synchronize: false
          entities: []
        `,
        'seed-b.yml': `
          germinator: v2
          synchronize: false
          entities: []
        `,
      },
      async (inDir) => {
        const files = await loadFiles(inDir('.'), {});

        expect(files).toHaveLength(2);
        expect(files[0].entries).toHaveLength(0);
        expect(files[1].entries).toHaveLength(0);
      },
    ));
});
