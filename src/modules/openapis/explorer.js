/**
 * OpenAPI explorer.
 * @return {[type]} [description]
 */
import * as _ from 'lodash';
import postal from 'postal';
import asyncMap from 'async/map';
import asyncWaterfall from 'async/waterfall';
import swal from 'sweetalert2';

import graph from './graph';
import '../../../extension/templates/modules/openapis/explorer/module.css';
import '../stories/story-viewer';
import '../stories/story-player';
import './authentication';
import CatalogService from '../../lib/openapi/catalog-service';
import CredentialsManager from '../../lib/openapi/browser-credentials-manager';

import tplBody from '../../../extension/templates/modules/openapis/explorer/index.hbs';
import tplGeneral from '../../../extension/templates/modules/openapis/explorer/general.hbs';
import tplDefinitions from '../../../extension/templates/modules/openapis/explorer/definitions.hbs';
import tplDefinition from '../../../extension/templates/modules/openapis/explorer/definition.hbs';
import tplSecurityDefinitions from '../../../extension/templates/modules/openapis/explorer/security.hbs';
import tplOperations from '../../../extension/templates/modules/openapis/explorer/operations.hbs';
import tplOperation from '../../../extension/templates/modules/openapis/explorer/operation.hbs';
import tplPaths from '../../../extension/templates/modules/openapis/explorer/paths.hbs';
import tplGraph from '../../../extension/templates/modules/openapis/explorer/graph.hbs';

export default (function() {

  /*
   * Private
   */
  let _api = null;

  /**
   * Renders the provided Open API
   * definition.
   * @param  {[type]} openapi [description]
   * @return {[type]}         [description]
   */
  const _render = function(openapi) {
    return new Promise((resolve, reject) => {
      try {

        if (_.isEmpty(openapi)) {
          throw new Error('Invalid Open API specification');
        }

        // set the Open API instance
        _api = openapi;

        const model = {
          spec: openapi.spec
        };

        asyncWaterfall([

          (cb) => {
            // load bookmarked spots
            CatalogService.getBookmarkedSpots()
              .then(bookmarks => {
                model.bookmarks = bookmarks;
                cb();
              })
              .catch(cb);
          }

        ], (e) => {
          if (e) {
            console.error(e);
          }

          // render the body
          const html = tplBody(model);

          // render the body
          $('body').html(html);

          // scroll to top
          window.scrollTo(0, 0);

          // attach event listeners
          _attachListeners();

          let section = 'general';

          // check if there is a selected
          // section in the hashbang
          if (window.location.hash) {
            const hash = window.location.hash.replace('#', '');

            // check if the section exists
            if ($(`.menu .item[data-section='${hash}']`).length > 0) {
              section = hash;
            }
          }

          // render the selected section
          $(`.menu .item[data-section='${section}']`).trigger('click');

          // set the bookmarked status
          _checkIfBookmarked();

          // done
          resolve();
        });

      } catch (e) {
        reject(e);
      }
    });
  };

  /**
   * Attaches all event listeners
   * @return {[type]} [description]
   */
  const _attachListeners = function() {

    // menu sections
    $('.menu .item[data-section]').on('click', (e) => {
      // get the selected section and render it
      const section = $(e.currentTarget).attr('data-section');
      _renderSection(section);
    });
    $('.menu .item[data-action="bookmark api"]').on('click', _bookmarkApi);

    $('.ui.dropdown').dropdown();

  };

  /**
   * Renders a section.
   * @return {[type]} [description]
   */
  const _renderSection = function(section) {

    if (section === 'general') {
      _renderGeneral();
    } else if (section === 'definitions') {
      _renderDefinitions();
    } else if (section === 'security') {
      _renderSecurity();
    } else if (section === 'operations') {
      _renderOperations();
    } else if (section === 'stories') {
      _renderStories();
    }

    // change the hashbang
    window.location.hash = `#${section}`;

    // scroll to top
    window.scrollTo(0, 0);

    // mark the menu item as active
    $('.menu .item[data-section]').removeClass('active');
    $(`.menu .item[data-section="${section}"]`).addClass('active');

  };


  /**
   * Renders the general section
   * @return {[type]} [description]
   */
  const _renderGeneral = function() {
    try {

      const spec = _api.spec;

      const data = {
        info: spec.info,
        host: spec.host,
        basePath: spec.basePath,
        tags: spec.tags,
        schemes: spec.schemes,
        externalDocs: spec.externalDocs
      };

      const html = tplGeneral(data);
      $('#content').html(html);


    } catch (e) {
      console.error(`Failed to render General section - ${e}`);
    }
  };

  /**
   * Renders the definitions section
   * @return {[type]} [description]
   */
  const _renderDefinitions = function() {
    try {

      const data = {
        definitions: []
      };

      const definitions = _api.schemas;
      data.definitions = definitions;

      const html = tplDefinitions(data);
      $('#content').html(html);

      // listeners
      $('.card.definition .button').on('click', _renderDefinition);

    } catch (e) {
      console.error(`Failed to render General section - ${e}`);
    }
  };

  /**
   * Renders the security definitions section
   * @return {[type]} [description]
   */
  const _renderSecurity = function() {
    try {

      const data = {
        definitions: _api.securities
      };

      asyncWaterfall([

        (cb) => {

          // get activated securities
          asyncMap(data.definitions, (o, done) => {

            // get the security name
            const name = o.name;

            // get any saved credentials for this definition
            CredentialsManager.getCredentials(_api.specUrl, name)
              .then(credentials => {

                // if credentials are found, mark
                // security definition as activated
                o.activated = (!_.isEmpty(credentials));

                done();
              });
          }, (e) => {
            if (e) {
              console.error(e);
            }

            cb();
          });

        }

      ], (e) => {

        if (e) {
          console.error(e);
        }

        const html = tplSecurityDefinitions(data);
        $('#content').html(html);

        // bind listeners
        $('.button[data-action="activate authentication"]').on('click', (e) => {

          const type = $(e.currentTarget).attr('data-type');
          const name = $(e.currentTarget).attr('data-name');

          postal.publish({
            channel: 'openapis',
            topic: 'activate authentication',
            data: {
              api: _api,
              type,
              name
            }
          });
        });

        $('.button[data-action="deactivate authentication"]').on('click', (e) => {

          const type = $(e.currentTarget).attr('data-type');
          const name = $(e.currentTarget).attr('data-name');

          postal.publish({
            channel: 'openapis',
            topic: 'deactivate authentication',
            data: {
              api: _api,
              type,
              name
            }
          });
        });

      });

    } catch (e) {
      console.error(`Failed to render Security section - ${e}`);
    }
  };

  /**
   * Displays the selected definition
   * details.
   * @param  {[type]} e [description]
   * @return {[type]}   [description]
   */
  const _renderDefinition = function() {
    const id = $(this).attr('data-id');

    // get the definition instance
    const definition = _api.getDefinition(id);

    const data = {
      id,
      definition
    };

    const html = tplDefinition(data);

    $(html)
      .modal({
        duration: 100
      })
      .modal('show');

    // listeners
    $('.view.definition').on('click', _renderDefinition);
  };


  /**
   * Renders the operations section
   * @return {[type]} [description]
   */
  const _renderOperations = function() {
    try {

      const data = {};

      const html = tplOperations(data);
      $('#content').html(html);

      // bind the menu listener
      $('.menu.presentation .item').on('click', function() {
        // render the selected operations view
        const id = $(this).attr('data-id');
        _onRenderOperationsView(id);
      });

      // render the API paths by default
      _onRenderOperationsView('paths');

    } catch (e) {
      console.error(`Failed to render General section - ${e}`);
    }
  };

  /**
   * Renders the selected operations view
   * by Id.
   * @param  {[type]} id [description]
   * @return {[type]}    [description]
   */
  const _onRenderOperationsView = function(id = 'paths') {

    if (id === 'paths') {
      // default view
      _renderOperationPaths();
    } else if (id === 'graph') {
      _renderOperationsGraph();
    }

    // switch active item
    $('.menu.presentation .item').removeClass('active');
    $(`.menu.presentation .item[data-id="${id}"]`).addClass('active');
  };


  /**
   * Renders the API paths section
   * @return {[type]} [description]
   */
  const _renderOperationPaths = function() {
    try {

      const data = {
        paths: _api.operationsByPath
      };

      const html = tplPaths(data);
      $('#section-contents').html(html);

      // path link clicked
      $('a[data-type="path"]').on('click', function() {

        // get the path Id and dispatch the event
        const path = $(this).attr('data-id');
        const verb = $(this).attr('data-verb');

        postal.publish({
          channel: 'openapis',
          topic: 'openapi.path.operations',
          data: {
            path,
            verb
          }
        });
      });

    } catch (e) {
      console.error(`Failed to render General section - ${e}`);
    }
  };


  /**
   * Renders the API paths section
   * @return {[type]} [description]
   */
  const _renderOperationsGraph = function() {
    try {

      const data = {};

      const html = tplGraph(data);
      $('#section-contents').html(html);

      // render the graph view
      graph.render('#graph', _api);

    } catch (e) {
      console.error(`Failed to render General section - ${e}`);
    }
  };

  /**
   * Displays a modal with
   * the operations details.
   * @param  {[type]} e [description]
   * @return {[type]}   [description]
   */
  const _renderOperationsModal = function(path, verb) {
    try {
      // get the definition instance
      const definition = _.cloneDeep(_api.path(path));

      const data = {
        path,
        definition
      };

      asyncWaterfall([

        (cb) => {

          // get the list of activated
          // security definitions
          CredentialsManager.getActivatedBySpecUrl(_api.specUrl)
            .then((securities) => {
              data.securities = securities;
              cb();
            });
        },

        (cb) => {

          // go through all operations
          _.each(definition, (o) => {

            // process security
            _.each(o.security, (s) => {

              // enrich security elements
              o.security = _.map(s, (o, key) => ({
                definition: key,
                scopes: o,
                active: _.includes(data.securities, key)
              }));
            });
          });

          cb();
        }

      ], () => {

        const html = tplOperation(data);

        const $html = $(html);

        const $modal = $html.modal({
          duration: 100
        });

        $modal.modal('show');

        const $tab = $('.menu .item', $html);
        $tab.tab();

        $('.modal .menu .item').on('click', function() {
          const verb = $(this).attr('data-tab');
          $('.modal .tab').removeClass('active');
          $tab.tab('change tab', verb);
          $modal.modal('refresh');
        });

        $modal.modal('refresh');

        // if a verb is given, select the
        // corresponding tab
        if (!_.isUndefined(verb)) {
          $tab.tab('change tab', verb);
        }

        // listeners
        $('.modal .view.definition').on('click', _renderDefinition);
        $('.modal .button[data-action="create story"]').on('click', (e) => {

          // get the target operation Id
          const operationId = $(e.currentTarget).attr('data-operation');

          // render the data stories section
          _renderSection('stories');

          postal.publish({
            channel: 'stories',
            topic: 'create story',
            data: {
              api: _api,
              operationId
            }
          });

        });


      });

    } catch (e) {
      // silent fail if path is undefined
    }
  };


  /**
   * Called when an API path operation
   * needs to be opened.
   * @param  {[type]} data [description]
   * @return {[type]}      [description]
   */
  const _onOpenApiPathOperations = function(data) {

    // render the operations modal
    _renderOperationsModal(data.path, data.verb);
  };


  /**
   * Bookmarks the current API spot.
   * @return {[type]} [description]
   */
  const _bookmarkApi = function(e) {

    try {

      // get the API details
      const specUrl = _api.specUrl;
      const title = _api.title;

      // check current state
      const $el = $(e.currentTarget);

      CatalogService.isBookmarked(specUrl)
        .then(bookmarked => {

          if (!bookmarked) {

            // add a bookmark
            CatalogService.addBookmark(specUrl, title)
              .then(() => {
                $el.attr('data-bookmarked', '');
                $el.find('i.bookmark.icon').addClass('pink');

                // show an alert
                swal({
                  title: 'Open API spot bookmarked!',
                  text: 'You have created a bookmark for this API spot. Now you can easily access it from the main Open APIs page.',
                  type: 'success',
                  timer: 10000
                });
              })
              .catch(e => {
                // show an error alert
                swal({
                  title: 'Something went wrong...',
                  text: e.message,
                  type: 'error',
                  timer: 3000
                });
              });
          } else {

            // remove the bookmark
            CatalogService.removeBookmark(specUrl)
              .then(() => {
                $el.attr('data-bookmarked', null);
                $el.find('i.bookmark.icon').removeClass('pink');
              });
          }
        });

    } catch (e) {
      console.error(e);
    }
  };

  /**
   * Cheks whether the API spot
   * is bookmarked and sets the
   * status.
   * @return {[type]} [description]
   */
  const _checkIfBookmarked = function() {

    try {

      // get the API details
      const specUrl = _api.specUrl;

      // get the element
      const $el = $('.ui.menu .item[data-action="bookmark api"]');

      CatalogService.isBookmarked(specUrl)
        .then(bookmarked => {
          if (bookmarked) {
            $el.attr('data-bookmarked', '');
            $el.find('i.bookmark.icon').addClass('pink');
          }
        });

    } catch (e) {
      console.error(e);
    }
  };

  /**
   * Reloads the API stories section.
   * @return {[type]} [description]
   */
  const _onReloadStories = function() {
    _renderStories();
  };


  /**
   * Triggers an event for
   * rendering the available stories.
   * @return {[type]} [description]
   */
  const _renderStories = function() {

    postal.publish({
      channel: 'stories',
      topic: 'load',
      data: {
        api: _api
      }
    });

  };

  // event listeners
  postal.subscribe({
    channel: 'openapis',
    topic: 'openapi.path.operations',
    callback: _onOpenApiPathOperations
  });

  postal.subscribe({
    channel: 'stories',
    topic: 'reload stories',
    callback: _onReloadStories
  });

  postal.subscribe({
    channel: 'openapis',
    topic: 'reload security',
    callback: _renderSecurity
  });

  return {

    /*
     * Public
     */
    render: _render

  };

}());
