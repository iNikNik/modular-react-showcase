// @flow
import { compose } from 'ramda'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { matchPath, StaticRouter } from 'react-router-dom'
import createMemoryHistory from 'history/createMemoryHistory'
import { Provider } from 'react-redux'
import handleReduxModule from 'redux-async-bundles/handleReduxModule'
import extractReducers from 'redux-async-bundles/extractReducers'
import rejectFailedBundles from 'react-async-bundles/rejectFailedBundles'
import loadAsyncBundles from 'react-async-bundles/loadAsyncBundles'
import { createLocationFromUrl } from 'refetch'
import loadDataForUrl from 'refetch/loadDataForUrl'

import App from 'client/App'
import Template from './Template'
import getRoutes from 'common/routing/getRoutes'
import { BundleProvider } from 'common/utils/bundle'
import createStore from 'common/redux/createStore'
import bundleStoreCreatorFactory from 'common/routing/bundleStoreCreatorFactory'

import type { $Request, $Response } from 'express'
import type { CurriedFunction2 } from 'ramda'
import type {
  BundleMeta,
  BundleStoreCreatorConfig,
  ServerRenderContext,
} from 'react-async-bundles/types'

type RenderResult = {
  status: number,
  body: string,
  url?: string,
}

const sendSuccess = (res: $Response, status: number, body: string): $Response =>
  res.status(status).set('Content-Type', 'text/html').send(body)
const sendRedirect = (res: $Response, status: number, url: string): $Response =>
  res.redirect(status, url)

export const rendererFactory = (template: Template) => {
  const createRenderResult = (
    context: ServerRenderContext,
    html: string,
    initialState: Object = {}
  ): RenderResult => {
    const { url, status } = context
    const isRedirected = !!url

    return {
      body: template.renderTemplate({ html, initialState }),
      status: status || (isRedirected ? 301 : 200),
      url,
    }
  }
  const getEmptyPageAndLog = compose(
    () => createRenderResult({ status: 500 }, ''),
    e => console.error('[SERVER] Render error', e)
  )

  return (req: $Request, res: $Response): void => {
    const routes = getRoutes()
    const bundleStoreConfig: BundleStoreCreatorConfig = {
      handleBundleModule: handleReduxModule,
      matchPath,
    }

    const doServerRender = (initialBundles: BundleMeta[]) => {
      const history = createMemoryHistory()
      const initialReducers = extractReducers(initialBundles)
      const store = createStore({ history, initialReducers })
      const createBundleStore = bundleStoreCreatorFactory(store)
      const bundleStore = createBundleStore(
        bundleStoreConfig,
        routes,
        initialBundles
      )

      const context: ServerRenderContext = {}
      const serverSideApp = (
        <Provider store={store}>
          <StaticRouter context={context} location={req.url}>
            <BundleProvider store={bundleStore}>
              <App />
            </BundleProvider>
          </StaticRouter>
        </Provider>
      )
      return Promise.resolve()
        .then(() =>
          loadDataForUrl(
            store,
            bundleStore.getRoutes(),
            createLocationFromUrl(req.url)
          )
        )
        .then(() => {
          const html = ReactDOMServer.renderToString(serverSideApp)
          return createRenderResult(context, html, store.getState())
        })
    }

    Promise.resolve()
      .then(() => loadAsyncBundles(bundleStoreConfig, routes, req.url))
      // We need to load ALL the bundles, otherwise send 500 error
      .then(rejectFailedBundles)
      .then(doServerRender)
      .catch(getEmptyPageAndLog)
      .then((renderResult: RenderResult) => {
        return renderResult.url
          ? sendRedirect(res, renderResult.status, renderResult.url)
          : sendSuccess(res, renderResult.status, renderResult.body)
      })
  }
}
