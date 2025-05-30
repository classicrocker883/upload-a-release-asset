jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      access: jest.fn(),
      readFile: jest.fn().mockResolvedValue(Buffer.from('test content'))
    },
    statSync: jest.fn().mockReturnValueOnce({
      size: 527
    }),
    readFileSync: jest.fn((path, ...args) => {
      if (path === 'asset_path') {
        return Buffer.from('test content');
      }
      if (path === process.env.GITHUB_EVENT_PATH) {
        return JSON.stringify({});
      }
      return actualFs.readFileSync(path, ...args);
    }),
    createReadStream: jest.fn().mockReturnValueOnce({
      pipe: jest.fn()
    })
  };
});

const core = require('@actions/core');
const { getOctokit, context } = require('@actions/github');
const fs = require('fs');
const run = require('../src/upload-release-asset');

describe('Upload Release Asset', () => {
  let uploadReleaseAsset;
  let content;

  beforeAll(() => {
    process.env.GITHUB_TOKEN = 'token';
  });

  afterAll(() => {
    delete process.env.GITHUB_TOKEN;
  });

  beforeEach(() => {
    uploadReleaseAsset = jest.fn().mockReturnValueOnce({
      data: {
        browser_download_url: 'browserDownloadUrl'
      }
    });

    fs.statSync = jest.fn().mockReturnValueOnce({
      size: 527
    });

    content = Buffer.from('test content');
    fs.readFileSync = jest.fn().mockReturnValueOnce(content);

    context.repo = {
      owner: 'owner',
      repo: 'repo'
    };

    const github = {
      rest: {
        repos: {
          uploadReleaseAsset
        }
      }
    };

    getOctokit.mockImplementation(() => github);
  });

  test('Upload release asset endpoint is called', async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce('upload_url')
      .mockReturnValueOnce('asset_path')
      .mockReturnValueOnce('asset_name')
      .mockReturnValueOnce('asset_content_type');

    const mockStream = { pipe: jest.fn() };
    fs.createReadStream = jest.fn().mockReturnValueOnce(mockStream);

    await run();

    expect(uploadReleaseAsset).toHaveBeenCalledWith({
      url: 'upload_url',
      headers: { 'content-type': 'asset_content_type', 'content-length': 527 },
      name: 'asset_name',
      data: mockStream
    });
  });

  test('Output is set', async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce('upload_url')
      .mockReturnValueOnce('asset_path')
      .mockReturnValueOnce('asset_name')
      .mockReturnValueOnce('asset_content_type');

    core.setOutput = jest.fn();

    await run();

    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'browser_download_url', 'browserDownloadUrl');
  });

  test('Action fails elegantly', async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce('upload_url')
      .mockReturnValueOnce('asset_path')
      .mockReturnValueOnce('asset_name')
      .mockReturnValueOnce('asset_content_type');

    uploadReleaseAsset.mockRestore();
    uploadReleaseAsset.mockImplementation(() => {
      throw new Error('Error uploading release asset');
    });

    core.setOutput = jest.fn();

    core.setFailed = jest.fn();

    await run();

    expect(uploadReleaseAsset).toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith('Error uploading release asset');
    expect(core.setOutput).toHaveBeenCalledTimes(0);
  });

  test('Fails when GITHUB_TOKEN is missing', async () => {
    // --- remove token temporarily
    const savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    core.setFailed = jest.fn();

    await run();

    expect(core.setFailed).toHaveBeenCalledWith('GITHUB_TOKEN is missing');

    process.env.GITHUB_TOKEN = savedToken;
  });
});
