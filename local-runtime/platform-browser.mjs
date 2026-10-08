import Vue from 'vue/dist/vue.esm.js';
import Vuex from 'vuex';
import _ from 'lodash';
import Splide from '@splidejs/splide';
Vue.use(Vuex);
let fixture;
export const eventBus = new Vue();
export const uuidv4 = () => crypto.randomUUID();
export const debounce = _.debounce;
export const smoothScroll = target => (typeof target === 'string' ? document.querySelector(target) : target)?.scrollIntoView?.({behavior: 'smooth'});
export const isLinkSameStoreDomain = value => {try {return new URL(value, location.origin).origin === location.origin;} catch {return false;}};
export const createPriceObjects = value => value?.data || value || {};
export const getImageMeta = (src, callback) => {const image = new Image(); image.onload = () => callback(image.width, image.height); image.src = localImage(src);};
export const localImage = src => String(src || '').startsWith('/tema/assets/') || String(src || '').startsWith('data:image/') ? src : '/__local/placeholder.svg';
export function report(message, error = false, details) {
  window.__yampiLocalMessages ||= [];
  window.__yampiLocalMessages.push({message, error, details});
  if (error) window.__yampiLocalReady = false;
  let target = document.querySelector('#yampi-local-notice');
  if (!target) {target = document.createElement('aside'); target.id = 'yampi-local-notice'; document.body.prepend(target);}
  target.textContent = message; target.dataset.error = String(error);
}
const denied = async () => {report('Esta ação depende dos serviços da loja e está desativada na prévia local.'); const error = new Error('Serviço real desativado na prévia local.'); error.response = {status: 403, data: {errors: {local: [error.message]}}}; throw error;};
async function read(url) {
  const route = String(url || '').split('?')[0];
  const products = fixture.products || [];
  let payload;
  if (/suggestions/.test(route)) payload = products.map(p => p.name);
  else if (/collections/.test(route)) payload = [{id: 1, name: 'Coleção fictícia', url_path: '/preview?page=category', products: {data: products}}];
  else if (/categories/.test(route)) payload = fixture.categories || [];
  else if (/banners/.test(route)) payload = fixture.banners || [];
  else if (/ratings|reviews|questions|attributes|brands|filters|installments/.test(route)) payload = [];
  else if (/count/.test(route)) payload = products.length;
  else if (/products|similars|recommendations|search/.test(route)) payload = products;
  else throw new Error(`Serviço GET não simulado: ${route}. Configure os dados locais.`);
  return {data: {data: _.cloneDeep(payload), meta: {total: Array.isArray(payload) ? payload.length : 0, current_page: 1, last_page: 1}, links: {}}, status: 200};
}
export const client = Object.assign(config => (String(config.method || 'get').toLowerCase() === 'get' ? read(config.url) : denied()), {get: read, post: denied, put: denied, patch: denied, delete: denied});
export const builderSearch = query => query || {};
export const urlSearch = query => '/preview?page=category&' + new URLSearchParams(query || {});
export class SearchAttributesHandler {
  constructor() {this.attributes = [];}
  add(value) {this.attributes.push(value); return this;}
  remove(value) {this.attributes = this.attributes.filter(item => item !== value); return this;}
  get() {return this.attributes;}
  clear() {this.attributes = [];}
}
const safeLink = value => {
  const url = new URL(String(value || '/'), location.origin);
  if (url.origin !== location.origin) return '#';
  if (url.pathname === '/') return '/preview?page=home';
  if (url.pathname === '/busca') return '/preview?page=category';
  return url.pathname + url.search + url.hash;
};
const product = () => fixture.product?.data || fixture.product || fixture.products?.[0] || {};
function currentProduct(vm) {const value = vm.product || vm.$attrs.product; return value?.data || value?.content || value || product();}
function firstSku(value) {return value?.skus?.data?.[0] || {...value, id: value?.id || 1, blocked_sale: false, allow_sell_without_customization: true, price_sale: value?.prices?.data?.price || 0, price_discount: 0, days_availability_formated: value?.availability || 'Disponível', customizations: {data: []}};}
export const mixins = {
  mobile: {data: () => ({isMobile: matchMedia('(max-width:700px)').matches}), mounted() {this.__localResize = () => {this.isMobile = matchMedia('(max-width:700px)').matches;}; window.addEventListener('resize', this.__localResize);}, beforeDestroy() {window.removeEventListener('resize', this.__localResize);}},
  merchant: {computed: {merchant: () => fixture.merchantData}},
  product: {computed: {validProduct() {return currentProduct(this);}, firstValidSku() {return firstSku(this.validProduct);}, selectedSku() {return this.$store.state.product.selectedSku || this.firstValidSku;}, validSku() {return this.selectedSku;}}, methods: {setSelectedSku(value) {this.$store.commit('product/SET', {selectedSku: value});}}},
  productCardTheme: {computed: {themeStyle: () => fixture.pageConfig?.data?.theme?.params || {}, spaceBetweenNamePrice: () => 'small', oldPriceSize: () => 'small', smallCentsPrice: () => false, showMaxInstallment: () => false}},
  prices: {data: () => ({loadingPrices: false, productPricesParams: {}}), computed: {
    productPrices() {return currentProduct(this).prices?.data || {};},
    selectedPrice() {return this.productPrices.price_formated || this.$formatMoney(this.productPrices.price);},
    priceText: () => '', hasPromotion() {return !!this.productPrices.has_promotion;}, hasPrice: () => false,
  }, methods: {formatMoney: v => Number(v || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}},
  helpers: {methods: {uuidv4, getImageMeta}},
  buttons: {methods: {buttonClass: () => '', handleClick: denied}},
  cache: {data: () => ({cache: {}}), methods: {getCache(key) {return this.cache[key];}, setCache(key, value) {Vue.set(this.cache, key, value);}}},
  cashback: {computed: {cashbackValue: () => 0}, methods: {calculateCashback: () => 0, getValidCashback: () => ({})}},
  errors: {data: () => ({errors: {}}), methods: {hasError(name) {return !!this.errors[name]?.length;}, getError(name) {return this.errors[name]?.[0] || '';}, clearErrors() {this.errors = {};}, handleErrors(error) {this.errors = error.response?.data?.errors || {}; report(error.message);}}},
  queryParams: {data: () => ({queryParams: {}}), methods: {bootQueryParams() {this.queryParams = Object.fromEntries(new URLSearchParams(location.search));}, updateQueryParams(values) {this.queryParams = {...this.queryParams, ...values};}, getQueryParam: name => new URLSearchParams(location.search).get(name)}},
  touchable: {data: () => ({isTouchable: matchMedia('(pointer:coarse)').matches})},
};
export function setup(data) {
  fixture = data;
  window.merchant = data.merchantData; window.product = product(); window.Yampi = {local: true, cache: {js: 10}, mago_config: {}}; window._ = _;
  Vue.config.productionTip = false;
  Vue.config.errorHandler = (error, component, info) => report('Erro Vue local: ' + error.message, true, {component: component?.$options.name, info, stack: error.stack});
  const modules = {
    merchant: {merchant: data.merchantData, storeModules: {new_search: false}, storeSearch: false, defaultCard: {}, categories: data.categories || []},
    product: {product: data.product, validProduct: product(), validSku: null, selectedSku: null, loadingPrices: false, price: product().prices?.data || {}},
    theme: {themeStyle: data.pageConfig?.data?.theme?.params || data.pageConfig?.theme?.params || {}},
    preview: {isPreview: true, isIframe: true, activeSection: null},
    header: {showSearchBar: false},
    cart: {cart: {items: [], prices: {total: 0, subtotal: 0, shipment: 0, discount: 0}, cart_discounts: []}, cartType: 'side_cart'},
    buyTogether: {combos: []},
    filters: {activeFilters: [], searchSelectedAttributes: [], selectedAttributes: [], searchFilters: {}, filters: [], selectedFilters: []},
    queryParams: {queryParams: {}, params: {}}, environment: {recomm: null}, images: {items: [], lazyloadImages: []}, queue: {items: []},
  };
  const store = new Vuex.Store({modules: Object.fromEntries(Object.entries(modules).map(([name, initial]) => [name, {
    namespaced: true, state: () => _.cloneDeep(initial), getters: Object.fromEntries(Object.keys(initial).map(key => [key, state => state[key]])),
    mutations: {PUSH(state, value) {state.items?.push(value);}, POP(state) {state.items?.shift();}, CLEAR(state) {if (state.items) state.items = [];}, SET(state, values) {Object.assign(state, values);}, SET_CART_TYPE(state, value) {state.cartType = value;}, SET_COMBOS(state, value) {state.combos = value;}},
    actions: {
      loadCart: () => null,
      redirectToCart: denied, addProductsToCart: denied, updateItemQuantity: denied, removeItem: denied,
      updateShowSearchBar: ({commit}, value) => commit('SET', {showSearchBar: value}),
      setRecomm: ({commit}, value) => commit('SET', {recomm: value}),
      updateQueryParams: ({commit}, value) => commit('SET', {queryParams: value}),
      setQueryParams: ({commit}, value) => commit('SET', {queryParams: value}),
      removeQueryParams: ({state, commit}, value) => {const query = {...state.queryParams}; for (const key of [].concat(value?.key || [])) delete query[key]; commit('SET', {queryParams: query});},
      bootQueryParams: () => null, removeActiveFilter: ({commit}, value) => commit('SET', {activeFilters: value || []}),
      trackViewItem: () => null,
    }
  }]))});
  Vue.prototype.$formatMoney = value => Number(value || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  Vue.prototype.$baseUrl = location.origin;
  Vue.prototype.$thumborize = localImage;
  Vue.prototype.$safeCleanLink = safeLink;
  Vue.prototype.$checkoutUrl = () => '#';
  Vue.prototype.$redirectTo = value => {const url = safeLink(value); if (url !== '#') location.assign(url); else report('Link externo desativado na prévia local.');};
  Vue.prototype.$applyQueriesToUrl = (url, query) => {const result = new URL(url, location.origin); for (const [k, v] of Object.entries(query || {})) result.searchParams.set(k, v); return result.pathname + result.search;};
  Vue.prototype.$randomString = uuidv4;
  Vue.prototype.$t = Vue.prototype.$tc = (key, value) => value === undefined ? key : String(value);
  Vue.component('RocketEmitter', {functional: true, render: (h, context) => h('div', context.data, context.children)});
  Vue.component('Splide', {props: ['options', 'slides'], data: () => ({splide: null}), render(h) {return h('div', {class: 'splide'}, [h('div', {class: 'splide__track'}, [h('ul', {class: 'splide__list'}, this.$slots.default)])]);}, mounted() {
    this.splide = new Splide(this.$el, this.options || {});
    for (const event of ['move', 'moved', 'click', 'lazyload:loaded']) this.splide.on(event, (...args) => this.$emit('splide:' + event, this.splide, ...args));
    this.splide.mount(); setTimeout(() => {if (!this._isDestroyed && this.splide) this.$emit('splide:mounted', this.splide);}, 0);
  }, beforeDestroy() {this.splide?.destroy();}, watch: {slides() {this.$nextTick(() => this.splide?.refresh());}}, methods: {sync(other) {if (other) this.splide.sync(other);}, go(index) {this.splide.go(index);}}});
  Vue.component('SplideSlide', {functional: true, render: (h, context) => h('li', {...context.data, class: ['splide__slide', context.data.class]}, context.children)});
  Vue.component('PinchZoom', {functional: true, render: (h, context) => h('div', {...context.data, class: ['pinch-zoom-content', context.data.class]}, context.children)});
  Vue.component('ZoomOnHover', {props: ['imgNormal', 'imgZoom', 'scale', 'altText'], render(h) {return h('img', {attrs: {src: localImage(this.imgNormal), alt: this.altText || ''}, style: {maxWidth: '100%'}, on: {load: () => this.$emit('loaded')}});}});
  Vue.directive('lazyload', {inserted(el) {if (el.dataset.src) el.src = localImage(el.dataset.src);}});
  Vue.directive('observe-visibility', {inserted(el, binding) {if (typeof binding.value === 'function') binding.value(true); else binding.value?.callback?.(true);}});
  Vue.directive('debounce', {inserted(el, binding) {if (typeof binding.value === 'function') el.addEventListener('input', _.debounce(binding.value, 250));}});
  document.addEventListener('submit', event => {event.preventDefault(); report('Formulários reais estão desativados na prévia local.');}, true);
  document.addEventListener('click', event => {const link = event.target.closest?.('a'); if (link && new URL(link.href).origin !== location.origin) {event.preventDefault(); report('Link externo desativado na prévia local.');}}, true);
  return store;
}
