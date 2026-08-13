import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from 'spec/helpers/testing-library';

import LocalAIModelHub from './LocalAIModelHub';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  SupersetClient: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}));

const galleryResult = {
  models: [
    {
      id: 'qwen3.5-4b',
      label: 'Qwen 3.5 4B',
      group: 'General',
      description: 'CPU-friendly default for daily analytics chat.',
      capabilities: [
        'Fast daily analytics responses',
        'Structured JSON outputs',
        'Concise chart and dashboard summaries',
      ],
      is_recommended: true,
      file_size: '4.1 GB',
      installed: true,
      is_default_model: true,
      is_repo_managed: false,
      backend: 'llama-cpp',
      backend_ready: true,
      backend_error: '',
      model_ready: true,
      missing_dependencies: [],
    },
    {
      id: 'deepseek-r1-distill-qwen-7b',
      label: 'DeepSeek R1 Distill Qwen 7B',
      group: 'Reasoning',
      description: 'Secondary reasoning model for harder prompts.',
      capabilities: [
        'Step-by-step reasoning',
        'SQL generation and repair',
        'Deeper analytical follow-up',
      ],
      is_recommended: false,
      file_size: '4.7 GB',
      installed: false,
      is_default_model: false,
      is_repo_managed: false,
      backend: 'llama-cpp',
      backend_ready: true,
      backend_error: '',
      model_ready: true,
      missing_dependencies: [],
    },
  ],
  localai_running: true,
  provider_enabled: true,
  provider_default_model: 'qwen3.5-4b',
  default_provider: 'localai',
  base_url: 'http://127.0.0.1:39671',
};

const offlineGallery = {
  json: {
    result: {
      ...galleryResult,
      localai_running: false,
      models: galleryResult.models.map(model => ({ ...model, installed: false })),
    },
  },
};

const onlineGallery = {
  json: {
    result: galleryResult,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders the qwen default and deepseek secondary model', async () => {
  mockGet.mockResolvedValue(onlineGallery);

  render(<LocalAIModelHub />, {
    useRedux: true,
    useRouter: true,
  });

  expect(await screen.findByText('Qwen 3.5 4B')).toBeInTheDocument();
  expect(screen.getByText('DeepSeek R1 Distill Qwen 7B')).toBeInTheDocument();
  expect(screen.getByText('Default provider')).toBeInTheDocument();
  expect(screen.getByText('Default model')).toBeInTheDocument();
  expect(screen.getByText('2 models available')).toBeInTheDocument();
  expect(screen.getByText('1 ready to infer')).toBeInTheDocument();
  expect(screen.getByText('1 assets installed')).toBeInTheDocument();
});

test('downloads the selected gallery model', async () => {
  mockGet
    .mockResolvedValueOnce(onlineGallery)
    .mockResolvedValueOnce(onlineGallery);
  mockPost.mockResolvedValue({
    json: {
      result: {
        deployed: true,
        model_id: 'deepseek-r1-distill-qwen-7b',
      },
    },
  });

  render(<LocalAIModelHub />, {
    useRedux: true,
    useRouter: true,
  });

  await screen.findByText('LocalAI Running');
  await userEvent.click(screen.getByRole('button', { name: /Download \(4.7 GB\)/ }));

  await waitFor(() => {
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/v1/ai-management/localai/models/install',
        jsonPayload: { model_id: 'deepseek-r1-distill-qwen-7b' },
      }),
    );
  });
});

test('starts LocalAI from the model hub', async () => {
  mockGet
    .mockResolvedValueOnce(offlineGallery)
    .mockResolvedValueOnce(onlineGallery);
  mockPost.mockResolvedValue({
    json: {
      result: {
        localai_running: true,
      },
    },
  });

  render(<LocalAIModelHub />, {
    useRedux: true,
    useRouter: true,
  });

  await screen.findByText('LocalAI Offline');
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Start LocalAI' })[0],
  );

  await waitFor(() => {
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/v1/ai-management/localai/start',
      }),
    );
  });
});
