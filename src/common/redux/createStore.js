// @flow
import { createStore, applyMiddleware } from 'redux'

import { Route } from 'react-router'

import { compose, identity } from 'ramda'
import thunkMiddleware from 'redux-thunk'
import { routerMiddleware } from 'react-router-redux'

import initialReducers from './initialReducers'
import withReducersManagement from 'common/redux/withReducersManagement'

import type {
  ManageableStore,
  ManageableStoreCreator,
} from 'common/redux/withReducersManagement'

export type StoreConfig = {
  history: any,
  initialState?: Object,
}

const isReduxDevToolsEnabled =
  // $FlowFixMe
  __DEVELOPMENT__ && __CLIENT__ && window.devToolsExtension
const storeFactory = (config: StoreConfig): ManageableStore<*, *> => {
  const { history, initialState = {} } = config
  // Build the middleware for intercepting and dispatching navigation actions
  const middleware = [thunkMiddleware, routerMiddleware(history)]
  const enhancers = [
    isReduxDevToolsEnabled ? window.devToolsExtension() : identity,
  ]
  // change StoreCreator signature to
  // (reducersMap, stateObject, enhancer?) => ManageableStore
  const finalCreateStore: ManageableStoreCreator<*, *> = compose(
    withReducersManagement(),
    applyMiddleware(...middleware),
    ...enhancers
  )(createStore)

  // Add the reducer to your store on the `router` key
  // Also apply our middleware for navigating
  const store = finalCreateStore(initialReducers, initialState)

  return store
}

export default storeFactory
