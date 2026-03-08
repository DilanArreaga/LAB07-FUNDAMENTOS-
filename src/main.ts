// =============================================================================
// PUNTO DE ENTRADA - Country Explorer
// =============================================================================
// Este es el archivo principal de la aplicación. Aquí:
// 1. Inicializamos la aplicación cuando el DOM está listo
// 2. Conectamos los event listeners
// 3. Manejamos el estado de la UI
//
// ## Arquitectura de la aplicación
// Seguimos una arquitectura simple pero organizada:
//
// ```
// ┌─────────────────────────────────────────────────────────────────────────┐
// │                              main.ts                                     │
// │                        (Punto de entrada)                               │
// │                                                                          │
// │  ┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐    │
// │  │   Eventos    │───>│  Estado de UI    │───>│    Renderizado     │    │
// │  │   (click,    │    │  (UiState)       │    │  (CountryCard,     │    │
// │  │    input)    │    │                  │    │   CountryModal)    │    │
// │  └──────────────┘    └──────────────────┘    └────────────────────┘    │
// │          │                    ▲                        │               │
// │          │                    │                        │               │
// │          ▼                    │                        │               │
// │  ┌──────────────────────────────────────────────────────┐             │
// │  │              countryApi.ts (Servicio)                 │             │
// │  │         (Comunicación con REST Countries)             │             │
// │  └──────────────────────────────────────────────────────┘             │
// └─────────────────────────────────────────────────────────────────────────┘
// ```
// =============================================================================

import type { Country, UiState } from './types/country';
import { searchCountries, ApiError } from './services/countryApi';
import { renderCountryList } from './components/CountryCard';
import { openModal } from './components/CountryModal';
import { getRequiredElement, showElement, hideElement, onDOMReady, debounce } from './utils/dom';

import { getFavorites, clearAllFavorites } from './utils/storage';

// =============================================================================
// ESTADO DE LA APLICACIÓN
// =============================================================================
// Mantenemos un estado global simple. En aplicaciones más grandes, usaríamos
// un patrón de gestión de estado más sofisticado (Redux, Zustand, etc.).
// =============================================================================

/** Estado actual de la UI */
let currentState: UiState = { status: 'idle' };

let allCountriesCache: Country[] =[];

/** Última búsqueda realizada (para evitar búsquedas duplicadas) */
let lastSearchQuery = '';

// =============================================================================
// REFERENCIAS A ELEMENTOS DEL DOM
// =============================================================================
// Obtenemos referencias a los elementos que vamos a manipular.
// Usamos getRequiredElement porque sabemos que estos elementos existen en el HTML.
// =============================================================================

let searchInput: HTMLInputElement;
let searchButton: HTMLButtonElement;
let retryButton: HTMLButtonElement;
let loadingState: HTMLElement;
let errorState: HTMLElement;
let errorMessage: HTMLElement;
let emptyState: HTMLElement;
let noResultsState: HTMLElement;
let countriesList: HTMLElement;

let regionFilter: HTMLSelectElement;
let favoritesToggle: HTMLInputElement;
let clearFavoritesBtn: HTMLButtonElement;

/**
 * Inicializa las referencias a los elementos del DOM.
 * Se llama una vez cuando la aplicación arranca.
 */
function initializeElements(): void {
  searchInput = getRequiredElement<HTMLInputElement>('#searchInput');
  searchButton = getRequiredElement<HTMLButtonElement>('#searchButton');
  retryButton = getRequiredElement<HTMLButtonElement>('#retryButton');
  loadingState = getRequiredElement<HTMLElement>('#loadingState');
  errorState = getRequiredElement<HTMLElement>('#errorState');
  errorMessage = getRequiredElement<HTMLElement>('#errorMessage');
  emptyState = getRequiredElement<HTMLElement>('#emptyState');
  noResultsState = getRequiredElement<HTMLElement>('#noResultsState');
  countriesList = getRequiredElement<HTMLElement>('#countriesList');

  regionFilter = getRequiredElement<HTMLSelectElement>('#regionFilter');
  favoritesToggle = getRequiredElement<HTMLInputElement>('#favoritesToggle');
  clearFavoritesBtn = getRequiredElement<HTMLButtonElement>('#clearFavoritesBtn');
}

// =============================================================================
// FUNCIONES DE RENDERIZADO DE ESTADO
// =============================================================================
// Estas funciones actualizan la UI según el estado actual.
// Seguimos el principio de "fuente única de verdad": el estado determina la UI.
// =============================================================================

/**
 * Oculta todos los estados de la UI.
 * Llamamos esto antes de mostrar un nuevo estado.
 */
function hideAllStates(): void {
  hideElement(loadingState);
  hideElement(errorState);
  hideElement(emptyState);
  hideElement(noResultsState);
  hideElement(countriesList);
}

/**
 * Renderiza la UI según el estado actual.
 *
 * ## Patrón de renderizado basado en estado
 * En lugar de manipular la UI directamente en respuesta a eventos,
 * actualizamos el estado y luego renderizamos basándonos en él.
 * Esto hace el código más predecible y fácil de debuggear.
 *
 * @param state - Nuevo estado de la UI
 */
function render(state: UiState): void {
  currentState = state;
  hideAllStates();

  // =========================================================================
  // SWITCH EXHAUSTIVO
  // =========================================================================
  // TypeScript verifica que manejemos todos los casos posibles.
  // Si agregamos un nuevo estado y olvidamos manejarlo, dará error.
  // =========================================================================
  switch (state.status) {
    case 'idle':
      // Estado inicial: mostramos mensaje de bienvenida
      showElement(emptyState);
      break;

    case 'loading':
      // Buscando países: mostramos spinner
      showElement(loadingState);
      break;

    case 'success':
      // Búsqueda exitosa con resultados
      if (state.data.length === 0) {
        showElement(noResultsState);
      } else {
        showElement(countriesList);
        renderCountryList(state.data, countriesList, handleCountryClick);
      }
      break;

    case 'error':
      // Error en la búsqueda
      showElement(errorState);
      errorMessage.textContent = state.message||'Error desconocido';
      break;

    case 'empty':
      // Sin resultados para la búsqueda
      showElement(noResultsState);
      break;

    default: {
      // Este bloque nunca debería ejecutarse si manejamos todos los casos
      // TypeScript usa esto para verificación de exhaustividad
      const _exhaustiveCheck: never = state;
      console.error('Estado no manejado:', _exhaustiveCheck);
    }
  }
}


//IMPLEMENTACION 

/**
 * Carga TODOS los países al iniciar. 
 * Esto nos permite extraer las regiones únicas y hacer filtros combinados instantáneos.
 */
async function loadInitialData(): Promise<void> {
  render({ status: 'loading' });
  try {
    const response = await fetch('https://restcountries.com/v3.1/all?fields=name,region,cca3,flags,capital,population');
    if (!response.ok) throw new Error('Error al conectar con la API');
    
    allCountriesCache = await response.json();
    
    // Poblamos el dropdown de regiones (Parte 1 - Definition of Done)
    populateRegions();
    
    // Aplicamos los filtros iniciales
    applyFilters();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al cargar países';
    render({ status: 'error', message });
  }
}

/**
 * Extrae las regiones únicas de la caché y llena el <select>
 */
function populateRegions(): void {
  const uniqueRegions = Array.from(new Set(allCountriesCache.map(c => c.region)))
    .filter(Boolean)
    .sort();

  regionFilter.innerHTML = '<option value="all">Todas las regiones</option>';

  uniqueRegions.forEach(region => {
    const option = document.createElement('option');
    option.value = region;
    // Traducciones rápidas para la UI
    const regionNames: Record<string, string> = {
      'Americas': 'América', 'Europe': 'Europa', 'Africa': 'África',
      'Oceania': 'Oceanía', 'Asia': 'Asia', 'Antarctic': 'Antártida'
    };
    option.textContent = regionNames[region] || region;
    regionFilter.appendChild(option);
  });
}

/**
 * El "Cerebro" de los filtros: Aplica Búsqueda + Región + Favoritos
 */
function applyFilters(): void {
  const query = searchInput.value.trim().toLowerCase();
  const selectedRegion = regionFilter.value;
  const showFavoritesOnly = favoritesToggle.checked;
  const favoriteCodes = getFavorites(); // Obtenemos la lista actual de favoritos

  // Controlamos la visibilidad del botón "Limpiar Favoritos"
  if (favoriteCodes.length > 0) {
    showElement(clearFavoritesBtn);
  } else {
    hideElement(clearFavoritesBtn);
    // Si estábamos viendo solo favoritos y los borramos, desmarcamos el toggle
    if (showFavoritesOnly) {
      favoritesToggle.checked = false;
    }
  }

  // Si no hay nada escrito ni filtros aplicados, podríamos mostrar el estado "idle" (vacío)
  // Pero para una mejor UX con filtros, mostraremos la lista filtrada directamente.
  if (query === '' && selectedRegion === 'all' && !showFavoritesOnly) {
     render({ status: 'success', data: allCountriesCache });
     return;
  }

  // Filtramos la caché combinando todas las reglas
  const filteredData = allCountriesCache.filter(country => {
    const matchesSearch = country.name.common.toLowerCase().includes(query);
    const matchesRegion = selectedRegion === 'all' || country.region === selectedRegion;
    const matchesFavorites = !showFavoritesOnly || favoriteCodes.includes(country.cca3);

    return matchesSearch && matchesRegion && matchesFavorites;
  });

  if (filteredData.length === 0) {
    render({ status: 'empty' });
  } else {
    render({ status: 'success', data: filteredData });
  }
}

// =============================================================================
// MANEJADORES DE EVENTOS
// =============================================================================

/**
 * Maneja la búsqueda de países.
 *
 * ## Flujo de la búsqueda:
 * 1. Obtenemos el valor del input
 * 2. Validamos que haya texto
 * 3. Mostramos estado de carga
 * 4. Hacemos la petición a la API
 * 5. Mostramos resultados o error
 */
async function handleSearch(): Promise<void> {
  const query = searchInput.value.trim();

  // Si la búsqueda está vacía, volvemos al estado inicial
  if (query.length === 0) {
    render({ status: 'idle' });
    lastSearchQuery = '';
    return;
  }

  // Evitamos búsquedas duplicadas
  if (query === lastSearchQuery && currentState.status === 'success') {
    return;
  }

  lastSearchQuery = query;

  // Mostramos estado de carga
  render({ status: 'loading' });

  try {
    // =========================================================================
    // ASYNC/AWAIT Y MANEJO DE ERRORES
    // =========================================================================
    // await pausa la ejecución hasta que la Promise se resuelve.
    // Si la Promise se rechaza, el error se captura en el catch.
    // =========================================================================
    const countries = await searchCountries(query);

    if (countries.length === 0) {
      render({ status: 'empty' });
    } else {
      render({ status: 'success', data: countries });
    }
  } catch (error) {
    // Determinamos el mensaje de error apropiado
    let message = 'Error desconocido al buscar países';

    if (error instanceof ApiError) {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }

    render({ status: 'error', message });

    // Log para debugging (en producción usaríamos un servicio de logging)
    console.error('Error en búsqueda:', error);
  }
}

/**
 * Maneja el click en una tarjeta de país.
 * Abre el modal con los detalles del país.
 *
 * @param country - País seleccionado
 */
function handleCountryClick(country: Country): void {
  openModal(country);
}

/**
 * Maneja el evento de reintentar después de un error.
 */
function handleRetry(): void {
  handleSearch();
}

// =============================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// =============================================================================

/**
 * Configura los event listeners de la aplicación.
 *
 * ## Event Listeners
 * Conectamos los elementos del DOM con sus manejadores de eventos.
 * Usamos debounce para el input para evitar demasiadas peticiones.
 */
function setupEventListeners(): void {
  // =========================================================================
  // BÚSQUEDA CON DEBOUNCE
  // =========================================================================
  // El debounce retrasa la ejecución hasta que el usuario deja de escribir.
  // Esto evita hacer una petición por cada tecla presionada.
  // =========================================================================
  const debouncedSearch = debounce(() => {
    void applyFilters();
  }, 400);

  // Input: búsqueda mientras se escribe (con debounce)
  searchInput.addEventListener('input', debouncedSearch);
  regionFilter.addEventListener('change', applyFilters);

  favoritesToggle.addEventListener('change', applyFilters);
  
  clearFavoritesBtn.addEventListener('click', () => {
    clearAllFavorites(); // Borra localStorage
    applyFilters();      // Re-renderiza la interfaz
  });

  // Botón de búsqueda: búsqueda inmediata
  searchButton.addEventListener('click', () => {
    void handleSearch();
  });

  // Enter en el input: búsqueda inmediata
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      void handleSearch();
    }
  });

  // Botón de reintentar
  retryButton.addEventListener('click', handleRetry);
}

/**
 * Inicializa la aplicación.
 *
 * ## Punto de entrada principal
 * Esta función se ejecuta cuando el DOM está completamente cargado.
 * Es el equivalente a `onCreate` en Android o `mounted` en Vue.
 */
function initializeApp(): void {
  try {
    // Obtenemos referencias a los elementos del DOM
    initializeElements();

    // Configuramos los event listeners
    setupEventListeners();

    // Mostramos el estado inicial
    loadInitialData();
    // Enfocamos el input de búsqueda para UX
    searchInput.focus();

    console.log('Country Explorer inicializado correctamente');
  } catch (error) {
    console.error('Error al inicializar la aplicación:', error);
  }
}
/**
 * Evento disparado desde las tarjetas (CountryCard) cuando se hace clic en el corazón.
 * Esto permite volver a filtrar en tiempo real si estamos en modo "Solo favoritos"
 */
export function handleFavoriteToggled(): void {
  applyFilters();
}


// =============================================================================
// ARRANQUE DE LA APLICACIÓN
// =============================================================================
// Usamos onDOMReady para asegurarnos de que el DOM esté listo antes de
// intentar acceder a los elementos.
// =============================================================================

onDOMReady(initializeApp);
