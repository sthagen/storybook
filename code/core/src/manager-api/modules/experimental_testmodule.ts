import { Addon_TypesEnum, type StoryId } from '@storybook/core/types';

import {
  TESTING_MODULE_CANCEL_TEST_RUN_REQUEST,
  TESTING_MODULE_RUN_REQUEST,
  TESTING_MODULE_WATCH_MODE_REQUEST,
  type TestProviderId,
  type TestProviderState,
  type TestProviders,
  type TestingModuleRunRequestPayload,
} from '@storybook/core/core-events';

import type { ModuleFn } from '../lib/types';

export type SubState = {
  testProviders: TestProviders;
};

const initialTestProviderState: TestProviderState = {
  details: {} as { [key: string]: any },
  cancellable: false,
  cancelling: false,
  running: false,
  watching: false,
  failed: false,
  crashed: false,
};

interface RunOptions {
  entryId?: StoryId;
}

export type SubAPI = {
  getTestProviderState(id: string): TestProviderState | undefined;
  updateTestProviderState(id: TestProviderId, update: Partial<TestProviderState>): void;
  clearTestProviderState(id: TestProviderId): void;
  runTestProvider(id: TestProviderId, options?: RunOptions): () => void;
  setTestProviderWatchMode(id: TestProviderId, watchMode: boolean): void;
  cancelTestProvider(id: TestProviderId): void;
};

export const init: ModuleFn = ({ store, fullAPI }) => {
  const state: SubState = {
    testProviders: store.getState().testProviders || {},
  };

  const api: SubAPI = {
    getTestProviderState(id) {
      const { testProviders } = store.getState();

      return testProviders?.[id];
    },
    updateTestProviderState(id, update) {
      return store.setState(
        ({ testProviders }) => {
          return { testProviders: { ...testProviders, [id]: { ...testProviders[id], ...update } } };
        },
        { persistence: 'session' }
      );
    },
    clearTestProviderState(id) {
      const update = {
        cancelling: false,
        running: true,
        failed: false,
        crashed: false,
        progress: undefined,
      };
      return store.setState(
        ({ testProviders }) => {
          return { testProviders: { ...testProviders, [id]: { ...testProviders[id], ...update } } };
        },
        { persistence: 'session' }
      );
    },
    runTestProvider(id, options) {
      const { index } = store.getState();
      if (!index) {
        throw new Error('No story index available. This is likely a bug.');
      }

      const indexUrl = new URL('index.json', window.location.href).toString();

      if (!options?.entryId) {
        const payload: TestingModuleRunRequestPayload = {
          providerId: id,
          indexUrl,
        };
        fullAPI.emit(TESTING_MODULE_RUN_REQUEST, payload);
        return () => api.cancelTestProvider(id);
      }

      if (!index[options.entryId]) {
        throw new Error('Could not find story entry for id: ' + options.entryId);
      }

      const findStories = (entryId: StoryId, results: StoryId[] = []): StoryId[] => {
        const node = index[entryId];
        if (node.type === 'story') {
          results.push(node.id);
        } else if ('children' in node) {
          node.children.forEach((childId) => findStories(childId, results));
        }
        return results;
      };

      const payload: TestingModuleRunRequestPayload = {
        providerId: id,
        indexUrl,
        storyIds: findStories(options.entryId),
      };
      fullAPI.emit(TESTING_MODULE_RUN_REQUEST, payload);
      return () => api.cancelTestProvider(id);
    },
    setTestProviderWatchMode(id, watchMode) {
      api.updateTestProviderState(id, { watching: watchMode });
      fullAPI.emit(TESTING_MODULE_WATCH_MODE_REQUEST, { providerId: id, watchMode });
    },
    cancelTestProvider(id) {
      api.updateTestProviderState(id, { cancelling: true });
      fullAPI.emit(TESTING_MODULE_CANCEL_TEST_RUN_REQUEST, { providerId: id });
    },
  };

  const initModule = async () => {
    const initialState: TestProviders = Object.fromEntries(
      Object.entries(fullAPI.getElements(Addon_TypesEnum.experimental_TEST_PROVIDER)).map(
        ([id, config]) => [
          id,
          {
            ...config,
            ...initialTestProviderState,
            ...(state?.testProviders?.[id] || {}),
          } as TestProviders[0],
        ]
      )
    );

    store.setState({ testProviders: initialState }, { persistence: 'session' });
  };

  return { init: initModule, state, api };
};
