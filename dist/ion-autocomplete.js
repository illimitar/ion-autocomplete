/*
 * ion-autocomplete 0.4.11
 * Copyright 2026 Danny Povolotski 
 * Copyright modifications 2026 Heron Santos 
 * https://github.com/illimitar/ion-autocomplete
 */
(function() {

'use strict';

angular.module('ion-autocomplete', []).directive('ionAutocomplete', [
    '$ionicBackdrop', '$ionicScrollDelegate', '$document', '$q', '$parse', '$interpolate', '$ionicPlatform', '$compile', '$templateRequest',
    function ($ionicBackdrop, $ionicScrollDelegate, $document, $q, $parse, $interpolate, $ionicPlatform, $compile, $templateRequest) {
        return {
            require: ['ngModel', 'ionAutocomplete'],
            restrict: 'A',
            scope: {
                maxSelectedItems: '=maxSelectedItems',
            },
            bindToController: {
                ngModel: '=',
                externalModel: '=',
                templateData: '=',
                itemsMethod: '&',
                itemsClickedMethod: '&',
                itemsRemovedMethod: '&',
                modelToItemMethod: '&',
                cancelButtonClickedMethod: '&',
                placeholder: '@',
                headerLabel: '@',
                cancelLabel: '@',
                selectItemsLabel: '@',
                selectedItemsLabel: '@',
                templateUrl: '@',
                itemValueKey: '@',
                itemViewValueKey: '@'
            },
            controllerAs: 'viewModel',
            controller: ['$attrs', '$timeout', '$scope', function ($attrs, $timeout, $scope) {

                var valueOrDefault = function (value, defaultValue) {
                    return !value ? defaultValue : value;
                };

                var controller = this;
                var hasCustomPlaceholder = angular.isDefined($attrs.placeholder) && $attrs.placeholder !== '';

                // set the default values of the one way binded attributes
                $timeout(function () {
                    controller.placeholder = valueOrDefault(controller.placeholder, 'Selecionar...');
                    controller.searchPlaceholder = hasCustomPlaceholder ? controller.placeholder : 'Pesquise...';
                    controller.cancelLabel = valueOrDefault(controller.cancelLabel, 'Ok');
                    controller.selectItemsLabel = valueOrDefault(controller.selectItemsLabel, "Selecione um item...");
                    controller.selectedItemsLabel = valueOrDefault(controller.selectedItemsLabel, $interpolate("Itens Selecionados{{maxSelectedItems ? ' (max. ' + maxSelectedItems + ')' : ''}}:")(controller));
                    controller.templateUrl = valueOrDefault(controller.templateUrl, undefined);
                    controller.itemValueKey = valueOrDefault(controller.itemValueKey, undefined);
                    controller.itemViewValueKey = valueOrDefault(controller.itemViewValueKey, undefined);
                });

                // set the default values of the passed in attributes
                this.firstStart = true;
                this.autoShow = valueOrDefault($attrs.show, "false");
                this.maxSelectedItems = valueOrDefault($attrs.maxSelectedItems, undefined);
                this.templateUrl = valueOrDefault($attrs.templateUrl, undefined);
                this.itemsMethodValueKey = valueOrDefault($attrs.itemsMethodValueKey, undefined);
                this.itemValueKey = valueOrDefault($attrs.itemValueKey, undefined);
                this.itemViewValueKey = valueOrDefault($attrs.itemViewValueKey, undefined);
                this.componentId = valueOrDefault($attrs.componentId, undefined);
                this.loadingIcon = valueOrDefault($attrs.loadingIcon, undefined);
                this.manageExternally = valueOrDefault($attrs.manageExternally, "false");
                this.clearOnSelect = valueOrDefault($attrs.clearOnSelect, "true");
                this.clearOnRemove = valueOrDefault($attrs.clearOnRemove, "false");
                // default debounce so the search input does not fire one request per keystroke
                // (GESTOR-24); an explicit ng-model-options attribute still overrides this.
                this.ngModelOptions = valueOrDefault($scope.$eval($attrs.ngModelOptions), { debounce: 300 });
                this.openClass = valueOrDefault($attrs.openClass, 'ion-autocomplete-open');
                this.closeClass = valueOrDefault($attrs.closeClass, 'ion-autocomplete-close');

                // loading flag if the items-method is a function
                this.showLoadingIcon = false;

                // the items, selected items and the query for the list
                this.searchItems = [];
                this.selectedItems = [];
                this.searchQuery = undefined;
                if (this.autoShow === "true") {
                    this.showLoadingIcon = true;
                    this.searchQuery = " ";
                }

                this.isArray = function (array) {
                    return angular.isArray(array);
                };
            }],
            link: function (scope, element, attrs, controllers) {

                // get the two needed controllers
                var ngModelController = controllers[0];
                var ionAutocompleteController = controllers[1];
                var fieldContainer = element.parent();
                var fieldIndicator = angular.element('<span class="ion-autocomplete-field-indicator" aria-hidden="true"><i class="icon ion-chevron-down"></i></span>');
                var syncFieldIndicator = function () {
                    var field = element[0].getBoundingClientRect();
                    var container = fieldContainer[0].getBoundingClientRect();
                    var containerStyle = window.getComputedStyle(fieldContainer[0]);
                    var borderRight = parseFloat(containerStyle.borderRightWidth) || 0;
                    var borderBottom = parseFloat(containerStyle.borderBottomWidth) || 0;

                    fieldIndicator.css({
                        right: Math.max(0, container.right - field.right - borderRight) + 'px',
                        bottom: Math.max(0, container.bottom - field.bottom - borderBottom) + 'px',
                        height: field.height + 'px'
                    });
                };

                fieldContainer.addClass('ion-autocomplete-field');
                fieldContainer.append(fieldIndicator);
                element.attr('aria-haspopup', 'dialog');
                if (!attrs.title) {
                    element.attr('title', 'Selecionar');
                }
                if (!attrs.placeholder) {
                    element.attr('placeholder', 'Selecionar...');
                }
                setTimeout(syncFieldIndicator, 0);
                window.addEventListener('resize', syncFieldIndicator);

                var resolveHeaderLabel = function () {
                    var label = attrs.headerLabel || attrs.ariaLabel;
                    var parent = element[0].parentNode;
                    var depth = 0;

                    while (!label && parent && depth < 5) {
                        var inputLabel = parent.querySelector && parent.querySelector('.input-label');
                        if (inputLabel) {
                            label = inputLabel.textContent;
                        }
                        parent = parent.parentNode;
                        depth++;
                    }

                    label = (label || '').replace(/^\s+|\s+$/g, '');
                    return label || ionAutocompleteController.placeholder || 'Selecionar item';
                };

                ionAutocompleteController.headerLabel = resolveHeaderLabel();

                // use a random css class to bind the modal to the component
                ionAutocompleteController.randomCssClass = "ion-autocomplete-random-" + Math.floor((Math.random() * 1000) + 1);

                var template = [
                    '<div class="ion-autocomplete-container ' + ionAutocompleteController.randomCssClass + ' modal ' + ionAutocompleteController.closeClass + ' " >',

                    '   <div class="bar bar-header bar-positive ion-autocomplete-titlebar">',
                    '      <h1 class="title">{{viewModel.headerLabel}}</h1>',
                    '      <button type="button" class="button button-icon ion-autocomplete-close-button" ng-click="viewModel.cancelClick()" aria-label="Fechar" title="Fechar">',
                    '         <i class="icon ion-close-round"></i>',
                    '      </button>',
                    '   </div>',

                    '   <div class="bar bar-subheader item-input-inset ion-autocomplete-searchbar">',
                    '      <div class="item-input-wrapper" role="search">',
                    '         <button type="button" class="button button-icon ion-autocomplete-search-button" ng-click="viewModel.fetchSearchQuery(viewModel.searchQuery || \'\', false)" aria-label="Pesquisar" title="Pesquisar">',
                    '            <i class="icon ion-ios-search"></i>',
                    '         </button>',
                    '         <input type="search" class="ion-autocomplete-search" ng-model="viewModel.searchQuery" ng-model-options="viewModel.ngModelOptions" placeholder="{{viewModel.searchPlaceholder}}"/>',
                    '      </div>',
                    '   </div>',

                    '   <ion-content class="ion-autocomplete-content">',
                    '      <ion-item class="item-divider">{{viewModel.selectedItemsLabel}}</ion-item>',

                    '      <ion-item ng-if="viewModel.isArray(viewModel.selectedItems)" ng-repeat="selectedItem in viewModel.selectedItems track by $index" class="item-icon-left item-icon-right item-text-wrap">',
                    '         <i class="icon ion-checkmark"></i>',
                    // '         {{viewModel.getItemValue(selectedItem, viewModel.itemValueKey, "id")}} - {{viewModel.getItemValue(selectedItem, viewModel.itemViewValueKey)}}',
                    '         {{viewModel.getItemValue(selectedItem, viewModel.itemViewValueKey)}}',
                    '         <i class="icon ion-trash-a" style="cursor:pointer" ng-click="viewModel.removeItem($index)"></i>',
                    '      </ion-item>',

                    '      <div class="ion-autocomplete-loading-icon" ng-if="viewModel.showLoadingIcon">',
                    '            <br />',
                    '            <br />',
                    '            <br />',
                    '            <br />',
                    '            <center><ion-spinner icon="{{viewModel.loadingIcon}}"></ion-spinner></center>',
                    '      </div>',

                    '      <div ng-if="!viewModel.showLoadingIcon">',

                    '            <ion-item ng-if="!viewModel.isArray(viewModel.selectedItems)" class="item-icon-left item-icon-right item-text-wrap">',
                    '               <i class="icon ion-checkmark"></i>',
                    // '               {{viewModel.getItemValue(viewModel.selectedItems, viewModel.itemValueKey, "id")}} - {{viewModel.getItemValue(viewModel.selectedItems, viewModel.itemViewValueKey)}}',
                    '               {{viewModel.getItemValue(viewModel.selectedItems, viewModel.itemViewValueKey)}}',
                    '               <i class="icon ion-trash-a" style="cursor:pointer" ng-click="viewModel.removeItem(0)"></i>',
                    '            </ion-item>',

                    '            <ion-item class="item-divider" ng-if="viewModel.searchItems.length > 0">{{viewModel.selectItemsLabel}}</ion-item>',

                    '            <ion-item ng-repeat="item in viewModel.searchItems" ng-if="!viewModel.isKeyValueInObjectArray(viewModel.selectedItems, \'id\', viewModel.getItemValue(item, viewModel.itemValueKey, \'id\'))" item-height="55px" item-width="100%" ng-click="viewModel.selectItem(item)" class="item-text-wrap">',
                    // '               {{viewModel.getItemValue(item, viewModel.itemValueKey, "id")}} - {{viewModel.getItemValue(item, viewModel.itemViewValueKey)}}',
                    '               {{viewModel.getItemValue(item, viewModel.itemViewValueKey)}}',
                    '            </ion-item>',
                    '      </div>',
                    '   </ion-content>',
                    '</div>'
                ].join('');

                // load the template synchronously or asynchronously
                $q.when().then(function () {

                    // first check if a template url is set and use this as template
                    if (ionAutocompleteController.templateUrl) {
                        return $templateRequest(ionAutocompleteController.templateUrl);
                    } else {
                        return template;
                    }
                }).then(function (template) {

                    // compile the template
                    var searchInputElement = $compile(angular.element(template))(scope);

                    // append the template to body
                    $document.find('body').append(searchInputElement);


                    // returns the value of an item
                    ionAutocompleteController.getItemValue = function (item, key, keyItem) {
                        key = key || keyItem;

                        // if it's an array, go through all items and add the values to a new array and return it
                        if (angular.isArray(item)) {
                            var items = [];
                            angular.forEach(item, function (itemValue) {
                                if (key && angular.isObject(item)) {
                                    items.push($parse(key)(itemValue));
                                } else {
                                    items.push(itemValue);
                                }
                            });
                            return items;
                        } else {
                            if (key && angular.isObject(item)) {
                                return $parse(key)(item);
                            }
                        }
                        return item;
                    };


                    ionAutocompleteController.isKeyValueInObjectArray = function (objectArray, key, value) {
                        if (angular.isArray(objectArray)) {
                            for (var i = 0; i < objectArray.length; i++) {
                                if (ionAutocompleteController.getItemValue(objectArray[i], key) === value) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    };

                    // function which selects the item, hides the search container and the ionic backdrop if it has not maximum selected items attribute set
                    ionAutocompleteController.selectItem = function (item) {

                        // if the clear on select is true, clear the search query when an item is selected
                        if (ionAutocompleteController.clearOnSelect == "true") {
                            ionAutocompleteController.searchQuery = undefined;
                        }

                        // return if the max selected items is not equal to 1 and the maximum amount of selected items is reached
                        if (ionAutocompleteController.maxSelectedItems != "1" &&
                            angular.isArray(ionAutocompleteController.selectedItems) &&
                            ionAutocompleteController.maxSelectedItems <= ionAutocompleteController.selectedItems.length) {
                            return;
                        }

                        // store the selected items
                        if (!ionAutocompleteController.isKeyValueInObjectArray(ionAutocompleteController.selectedItems, "id", ionAutocompleteController.getItemValue(item, ionAutocompleteController.itemValueKey, "id"))) {

                            // if it is a single select set the item directly
                            if (ionAutocompleteController.maxSelectedItems == "1") {
                                ionAutocompleteController.selectedItems = item;
                            } else {
                                // create a new array to update the model. See https://github.com/angular-ui/ui-select/issues/191#issuecomment-55471732
                                ionAutocompleteController.selectedItems = ionAutocompleteController.selectedItems.concat([item]);
                            }
                        }

                        // set the view value and render it
                        ngModelController.$setViewValue(ionAutocompleteController.selectedItems);
                        ngModelController.$render();

                        // hide the container and the ionic backdrop if it is a single select to enhance usability
                        if (ionAutocompleteController.maxSelectedItems == 1) {
                            ionAutocompleteController.hideModal();
                        }

                        // call items clicked callback
                        if (angular.isDefined(attrs.itemsClickedMethod)) {
                            ionAutocompleteController.itemsClickedMethod({
                                callback: {
                                    item: item,
                                    selectedItems: angular.isArray(ionAutocompleteController.selectedItems) ? ionAutocompleteController.selectedItems.slice() : ionAutocompleteController.selectedItems,
                                    selectedItemsArray: angular.isArray(ionAutocompleteController.selectedItems) ? ionAutocompleteController.selectedItems.slice() : [ionAutocompleteController.selectedItems],
                                    componentId: ionAutocompleteController.componentId
                                }
                            });
                        }
                    };

                    // function which removes the item from the selected items.
                    ionAutocompleteController.removeItem = function (index) {

                        // clear the selected items if just one item is selected
                        if (!angular.isArray(ionAutocompleteController.selectedItems)) {
                            ionAutocompleteController.selectedItems = [];
                            if (ionAutocompleteController.clearOnRemove == "true") {
                                ionAutocompleteController.searchQuery = undefined;
                                ionAutocompleteController.cancelClick();
                            }
                        } else {
                            // remove the item from the selected items and create a copy of the array to update the model.
                            // See https://github.com/angular-ui/ui-select/issues/191#issuecomment-55471732
                            var removed = ionAutocompleteController.selectedItems.splice(index, 1)[0];
                            ionAutocompleteController.selectedItems = ionAutocompleteController.selectedItems.slice();
                        }

                        // set the view value and render it
                        ngModelController.$setViewValue(ionAutocompleteController.selectedItems);
                        ngModelController.$render();

                        // call items clicked callback
                        if (angular.isDefined(attrs.itemsRemovedMethod)) {
                            ionAutocompleteController.itemsRemovedMethod({
                                callback: {
                                    item: removed,
                                    selectedItems: angular.isArray(ionAutocompleteController.selectedItems) ? ionAutocompleteController.selectedItems.slice() : ionAutocompleteController.selectedItems,
                                    selectedItemsArray: angular.isArray(ionAutocompleteController.selectedItems) ? ionAutocompleteController.selectedItems.slice() : [ionAutocompleteController.selectedItems],
                                    componentId: ionAutocompleteController.componentId
                                }
                            });
                        }
                    };

                    // watcher on the search field model to update the list according to the input
                    scope.$watch('viewModel.searchQuery', function (query) {
                        if (query !== undefined && (query.length === 0 || query === " ") && ionAutocompleteController.autoShow === "true") {
                            if (!ionAutocompleteController.isArray(ionAutocompleteController.selectedItems)) {
                                query = "%";
                            }
                        }
                        // this.firstStart = true;
                        if (!ionAutocompleteController.firstStart || (ionAutocompleteController.firstStart && ionAutocompleteController.autoShow === "true")) {
                            ionAutocompleteController.fetchSearchQuery(query, false);
                        } else {
                            ionAutocompleteController.firstStart = false;
                        }
                    });

                    // watcher on the max selected items to update the selected items label
                    scope.$watch('viewModel.maxSelectedItems', function (maxSelectedItems) {
                        // only update the label if the value really changed
                        if (ionAutocompleteController.maxSelectedItems != maxSelectedItems) {
                            ionAutocompleteController.selectedItemsLabel = $interpolate("Itens Selecionados{{maxSelectedItems ? ' (max. ' + maxSelectedItems + ')' : ''}}:")(ionAutocompleteController);
                        }
                    });

                    // update the search items based on the returned value of the items-method
                    ionAutocompleteController.fetchSearchQuery = function (query, isInitializing) {

                        // right away return if the query is undefined to not call the items method for nothing
                        if (query === undefined) {
                            return;
                        }

                        if (angular.isDefined(attrs.itemsMethod)) {

                            // show the loading icon
                            ionAutocompleteController.showLoadingIcon = true;

                            var queryObject = { query: query, isInitializing: isInitializing };

                            // if the component id is set, then add it to the query object
                            if (ionAutocompleteController.componentId) {
                                queryObject = {
                                    query: query,
                                    isInitializing: isInitializing,
                                    componentId: ionAutocompleteController.componentId
                                }
                            }

                            // convert the given function to a $q promise to support promises too
                            var promise = $q.when(ionAutocompleteController.itemsMethod(queryObject));

                            promise.then(function (promiseData) {

                                // if the promise data is not set do nothing
                                if (!promiseData) {
                                    return;
                                }

                                // if the given promise data object has a data property use this for the further processing as the
                                // standard httpPromises from the $http functions store the response data in a data property
                                if (promiseData && promiseData.data) {
                                    promiseData = promiseData.data;
                                }

                                // set the items which are returned by the items method
                                ionAutocompleteController.searchItems = ionAutocompleteController.getItemValue(promiseData,
                                    ionAutocompleteController.itemsMethodValueKey);

                                // force the collection repeat to redraw itself as there were issues when the first items were added
                                $ionicScrollDelegate.resize();
                            }, function (error) {
                                // reject the error because we do not handle the error here
                                return $q.reject(error);
                            }).finally(function () {
                                // hide the loading icon
                                ionAutocompleteController.showLoadingIcon = false;
                            });
                        }
                    };

                    var searchContainerDisplayed = false;

                    ionAutocompleteController.showModal = function () {
                        if (searchContainerDisplayed) {
                            return;
                        }

                        ionAutocompleteController.headerLabel = resolveHeaderLabel();

                        // show the backdrop and the search container
                        $ionicBackdrop.retain();
                        var modal = angular.element($document[0].querySelector('div.ion-autocomplete-container.' + ionAutocompleteController.randomCssClass));
                        modal.addClass(this.openClass);
                        modal.removeClass(this.closeClass);

                        // hide the container if the back button is pressed
                        scope.$deregisterBackButton = $ionicPlatform.registerBackButtonAction(function () {
                            ionAutocompleteController.hideModal();
                        }, 300);

                        // get the compiled search field
                        var searchInputElement = angular.element($document[0].querySelector('div.ion-autocomplete-container.' + ionAutocompleteController.randomCssClass + ' input'));

                        // focus on the search input field
                        if (searchInputElement.length > 0) {
                            searchInputElement[0].focus();
                            setTimeout(function () {
                                searchInputElement[0].focus();
                            }, 100);
                        }

                        // force the collection repeat to redraw itself as there were issues when the first items were added
                        $ionicScrollDelegate.resize();

                        searchContainerDisplayed = true;
                    };

                    ionAutocompleteController.hideModal = function () {
                        var modal = angular.element($document[0].querySelector('div.ion-autocomplete-container.' + ionAutocompleteController.randomCssClass));
                        modal.addClass(this.closeClass);
                        modal.removeClass(this.openClass);
                        ionAutocompleteController.searchItems = [];
                        ionAutocompleteController.searchQuery = (ionAutocompleteController.autoShow === "true" ? " " : undefined);
                        $ionicBackdrop.release();
                        scope.$deregisterBackButton && scope.$deregisterBackButton();
                        searchContainerDisplayed = false;
                    };

                    // object to store if the user moved the finger to prevent opening the modal
                    var scrolling = {
                        moved: false,
                        startX: 0,
                        startY: 0
                    };

                    // store the start coordinates of the touch start event
                    var onTouchStart = function (e) {
                        scrolling.moved = false;
                        // Use originalEvent when available, fix compatibility with jQuery
                        if (typeof (e.originalEvent) !== 'undefined') {
                            e = e.originalEvent;
                        }
                        scrolling.startX = e.touches[0].clientX;
                        scrolling.startY = e.touches[0].clientY;
                    };

                    // check if the finger moves more than 10px and set the moved flag to true
                    var onTouchMove = function (e) {
                        // Use originalEvent when available, fix compatibility with jQuery
                        if (typeof (e.originalEvent) !== 'undefined') {
                            e = e.originalEvent;
                        }
                        if (Math.abs(e.touches[0].clientX - scrolling.startX) > 10 ||
                            Math.abs(e.touches[0].clientY - scrolling.startY) > 10) {
                            scrolling.moved = true;
                        }
                    };

                    // click handler on the input field to show the search container
                    var onClick = function (event) {
                        // only open the dialog if was not touched at the beginning of a legitimate scroll event
                        if (scrolling.moved) {
                            return;
                        }

                        // prevent the default event and the propagation
                        event.preventDefault();
                        event.stopPropagation();

                        // show the ionic backdrop and the search container
                        ionAutocompleteController.showModal();
                    };

                    // function to call the model to item method and select the item
                    var resolveAndSelectModelItem = function (modelValue) {
                        // convert the given function to a $q promise to support promises too
                        var promise = $q.when(ionAutocompleteController.modelToItemMethod({ modelValue: modelValue }));

                        promise.then(function (promiseData) {
                            // select the item which are returned by the model to item method
                            ionAutocompleteController.selectItem(promiseData);
                        }, function (error) {
                            // reject the error because we do not handle the error here
                            return $q.reject(error);
                        });
                    };

                    // if the click is not handled externally, bind the handlers to the click and touch events of the input field
                    if (ionAutocompleteController.manageExternally == "false") {
                        element.bind('touchstart', onTouchStart);
                        element.bind('touchmove', onTouchMove);
                        element.bind('click', onClick);
                    }

                    // cancel handler for the cancel button which clears the search input field model and hides the
                    // search container and the ionic backdrop and calls the cancel button clicked callback
                    ionAutocompleteController.cancelClick = function () {
                        ionAutocompleteController.hideModal();

                        // call cancel button clicked callback
                        if (angular.isDefined(attrs.cancelButtonClickedMethod)) {
                            ionAutocompleteController.cancelButtonClickedMethod({
                                callback: {
                                    selectedItems: angular.isArray(ionAutocompleteController.selectedItems) ? ionAutocompleteController.selectedItems.slice() : ionAutocompleteController.selectedItems,
                                    selectedItemsArray: angular.isArray(ionAutocompleteController.selectedItems) ? ionAutocompleteController.selectedItems.slice() : [ionAutocompleteController.selectedItems],
                                    componentId: ionAutocompleteController.componentId
                                }
                            });
                        }
                    };

                    // watch the external model for changes and select the items inside the model
                    scope.$watch("viewModel.externalModel", function (newModel) {

                        if (angular.isArray(newModel) && newModel.length == 0) {
                            // clear the selected items and set the view value and render it
                            ionAutocompleteController.selectedItems = [];
                            ngModelController.$setViewValue(ionAutocompleteController.selectedItems);
                            ngModelController.$render();
                            return;
                        }

                        // prepopulate view and selected items if external model is already set
                        if (newModel && angular.isDefined(attrs.modelToItemMethod)) {
                            if (angular.isArray(newModel)) {
                                ionAutocompleteController.selectedItems = [];
                                angular.forEach(newModel, function (modelValue) {
                                    resolveAndSelectModelItem(modelValue);
                                })
                            } else {
                                resolveAndSelectModelItem(newModel);
                            }
                        }
                    });

                    // remove the component from the dom when scope is getting destroyed
                    scope.$on('$destroy', function () {
                        $ionicBackdrop.release();
                        window.removeEventListener('resize', syncFieldIndicator);
                        fieldIndicator.remove();
                        fieldContainer.removeClass('ion-autocomplete-field');

                        // angular takes care of cleaning all $watch's and listeners, but we still need to remove the modal
                        searchInputElement.remove();
                    });

                    // render the view value of the model
                    ngModelController.$render = function () {
                        element.val(ionAutocompleteController.getItemValue(ngModelController.$viewValue, ionAutocompleteController.itemViewValueKey));
                        if (ionAutocompleteController.selectedItems.length === 0 && ngModelController.$modelValue) {
                            ionAutocompleteController.selectedItems = ngModelController.$modelValue;
                        }
                    };

                    // set the view value of the model
                    ngModelController.$formatters.push(function (modelValue) {
                        var viewValue = ionAutocompleteController.getItemValue(modelValue, ionAutocompleteController.itemViewValueKey);
                        return viewValue == undefined ? "" : viewValue;
                    });

                    // set the model value of the model
                    ngModelController.$parsers.push(function (viewValue) {
                        return ionAutocompleteController.getItemValue(viewValue, ionAutocompleteController.itemValueKey);
                    });

                });

            }
        };
    }
]);

})();