// =============================================================================
// UTILIDADES DE ALMACENAMIENTO (Local Storage Helper)
// =============================================================================
// Este módulo maneja la persistencia de los países favoritos en el navegador.
// Cumple con el requerimiento: "Los favoritos persisten en localStorage"
// =============================================================================

/** * Clave única para guardar los datos en localStorage. 
 * Es buena práctica usar una constante para evitar errores de tipeo.
 */
const FAVORITES_KEY = 'country_explorer_favorites';

/**
 * Obtiene la lista de códigos de países (cca3) guardados en favoritos.
 * @returns Array de strings con los códigos de los países.
 */
export function getFavorites(): string[] {
  try {
    const storedFavorites = localStorage.getItem(FAVORITES_KEY);
    // Si hay datos, los convertimos de texto (JSON) a un array real. Si no, devolvemos un array vacío.
    return storedFavorites ? JSON.parse(storedFavorites) : [];
  } catch (error) {
    console.error('Error al leer los favoritos de localStorage:', error);
    return []; // Fallback seguro en caso de que el JSON esté corrupto
  }
}

/**
 * Guarda la lista actualizada de favoritos en localStorage.
 * @param favorites Array de códigos de países a guardar.
 */
export function saveFavorites(favorites: string[]): void {
  try {
    // Convertimos el array a texto (JSON) para que localStorage pueda guardarlo
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch (error) {
    console.error('Error al guardar favoritos en localStorage:', error);
  }
}

/**
 * Verifica si un país específico está en la lista de favoritos.
 * @param countryCode El código único del país (cca3).
 * @returns true si es favorito, false si no lo es.
 */
export function isFavorite(countryCode: string): boolean {
  const favorites = getFavorites();
  return favorites.includes(countryCode);
}

/**
 * Alterna el estado de favorito de un país (lo añade si no está, lo quita si ya está).
 * @param countryCode El código único del país (cca3).
 * @returns El nuevo estado del país (true si ahora es favorito, false si se quitó).
 */
export function toggleFavorite(countryCode: string): boolean {
  const favorites = getFavorites();
  const index = favorites.indexOf(countryCode);
  
  let isNowFavorite = false;

  if (index === -1) {
    // No estaba en favoritos, lo agregamos
    favorites.push(countryCode);
    isNowFavorite = true;
  } else {
    // Ya era favorito, lo eliminamos
    favorites.splice(index, 1);
    isNowFavorite = false;
  }

  // Guardamos la nueva lista
  saveFavorites(favorites);
  
  return isNowFavorite;
}

/**
 * Elimina todos los favoritos del almacenamiento local.
 */
export function clearAllFavorites(): void {
  localStorage.removeItem(FAVORITES_KEY);
}