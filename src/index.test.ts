import { ensureFile, remove, writeFile } from 'fs-extra';
import { getYamlFilePaths, loadYaml, isYamlFile } from '.';
import { safeDump } from 'js-yaml';

const testYaml = {
  entities: [
    {
      User: {
        id: 1,
        name: 'Test test',
      },
    },
  ],
};

describe('Germinator tests', () => {
  beforeAll(async (done) => {
    await ensureFile('./test/test.yaml');
    await ensureFile('./test/test.json');
    await ensureFile('./test/test.toml');
    done();
  });

  afterAll(async (done) => {
    await remove('./test');
    done();
  });

  test('Should return true for .yaml file', () => {
    const path = '/test/test.yaml';
    const isYaml = isYamlFile(path);
    expect(isYaml).toBe(true);
  });

  test('Should only return yaml files', async (done) => {
    const paths = await getYamlFilePaths('./test');

    expect(paths.length).toEqual(1);
    expect(paths[0]).toEqual(`${process.cwd()}/test/test.yaml`);

    done();
  });

  test('Should load yaml', async (done) => {
    const text = safeDump(testYaml);
    await writeFile(`${process.cwd()}/test/test.yaml`, text);

    const yaml = await loadYaml(`${process.cwd()}/test/test.yaml`);
    const { data } = yaml;
    expect(data).toHaveProperty('entities');

    const { entities } = data;
    expect(entities.length).toEqual(1);
    expect(entities).toEqual(testYaml.entities);

    done();
  });
});
