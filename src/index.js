import createSagaMiddleware, { takeEvery } from 'redux-saga';
import { parseTasksActions } from 'refect';
import { is, check, get, map } from 'refect/utils';
import { fork, select, call } from 'redux-saga/effects';

function isActionCreator(actionCreator) {
  return actionCreator && is.func(actionCreator) && actionCreator.type;
}

function* watcher(pattern, saga) {
  yield takeEvery(pattern, function* task(action) {
    const { payload } = action;

    if (payload) {
      check(is.array(action.payload), 'action in worker is not a refect action!');

      return yield fork(saga, ...payload);
    }

    return yield fork(saga);
  });
}

function* watch(pattern, saga) {
  if (isActionCreator(pattern)) {
    yield watch(pattern.type, saga);
  }

  if (is.array(pattern) && pattern.every(isActionCreator)) {
    yield watch(pattern.map(pattern.type), saga);
  }

  yield fork(watcher, pattern, saga);
}

export default function createRefectSagaMiddleware(customEffects) {
  const middleware = createSagaMiddleware();

  function getEffects(namespace, getActions) {
    const customedEffects = customEffects ?
      customEffects(namespace, getActions) : {};

    return {
      *get(path) {
        return yield select(state => {
          if (!path) {
            return state;
          }

          return get(state, `${namespace}.${path}`);
        });
      },
      *done(actionCreator, ...doneArgs) {
        check(actionCreator && is.func(actionCreator.task),
          'actionCreator should be a refect actionCreator');

        return yield call(actionCreator.task, ...doneArgs);
      },
      watch,
      ...customedEffects,
    };
  }

  middleware.runTask = ({ refectTasks, namespace, getActions }) => {
    const effects = getEffects(namespace, getActions);
    const taskActionCreators = parseTasksActions(refectTasks, namespace);

    return map(taskActionCreators, (actionCreator, actionName) => {
      function* finalTask(...args) {
        const taskMap = refectTasks(getActions(), effects);
        const task = taskMap[actionName];

        return yield call(task, ...args);
      }

      middleware.run(function* () {
        yield effects.watch(actionCreator.type, finalTask);
      });

      actionCreator.task = finalTask;

      return actionCreator;
    });
  };

  return middleware;
}
