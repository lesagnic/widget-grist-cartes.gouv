//
// Widget Cartes.gouv
// 
// Pour afficher les données des lignes d'une table GRIST ssous forme de Markers sur
// un fond cartes.gouv
//
// Variables globales de gestion des Markers
const defaultColor = "#0070C0"; // bleu
const selectedColor = '#548235'; // vert
// Dictionnaire pour retrouver rapidement un marker par ID de ligne
const markersById = {};
// Variable globale pour la ligne du marker selectionné
let currentRowId = null;
//
// Function de sélection du marker correspondant à la ligne courante 
function ChangeSelectedMarker(id) {
  if ( id != currentRowId ) {
    const marker = markersById[id];
    if (marker) {
      // Réinitialiser tous les markers
      Object.values(markersById).forEach(m => {
        m.getElement().querySelector('svg g path').setAttribute('fill', defaultColor);
      });
      // Mettre en évidence le marker de la nouvelle ligne
      marker.getElement().querySelector('svg g path').setAttribute('fill', selectedColor);
      // Changement de la ligne
      currentRowId = id;
      grist.setSelectedRows([currentRowId]);
    }
  }
}
//
// API GRIST : ready
grist.ready({   
  requiredAccess: 'read table',
  columns: [
    {
      name: "Titre",
      title: "Libellé",
      optional: false,
      description: "Valeur ou libellé de l'objet géoréférencé", // Ne s'affiche pas si multiple
      allowMultiple: false // Permet l'attribution de plusieurs colonnes.
    },
    {
      name: "Latitude",
      title: "Latitude",
      optional: false,
      type: "Numeric", // Quel type de colonne nous attendons.
      description: "Latitude", // Description du champ.
      allowMultiple: false // Permet l'attribution de plusieurs colonnes.
    },
    {
      name: "Longitude",
      title: "Longitude",
      optional: false,
      type: "Numeric", // Quel type de colonne nous attendons.
      description: "Longitude", // Description du champ.
      allowMultiple: false // Permet l'attribution de plusieurs colonnes.
    }
  ],
  allowSelectBy: true // Permet de choisir ce widget comme input d'un autre widget
});
//
// API GRIST : onRecords
grist.onRecords(table => {
  // Initialisation des coordonnées de la Bouding Box avec une valeur improbable
  let westLng = 999;
  let southLat = 999;
  let eastLng=999;
  let northLat = 999;
  // Déclaration d'un tableau pour y stocker les données de la table GRIST
  // Chaque ligne est représentée par un feature Map Libre car dans une premiere mise
  // en oeuvre les données étaient affichés en tant que Layer GeoJson
  let list = [];
  //
  // Definition de la Bouding Box des données et de la liste de features
  table.forEach ( record => {
    // On récupère les colonnes mappées
    const mapped = grist.mapColumnNames(record);
    if (mapped) {
      if ( westLng == 999 || westLng > mapped.Longitude ) {
        westLng = mapped.Longitude;
      }
      if ( southLat == 999 || southLat > mapped.Latitude ) {
        southLat = mapped.Latitude;
      }
      if ( eastLng == 999 || eastLng < mapped.Longitude ) {
        eastLng = mapped.Longitude;
      }
      if ( northLat == 999 || northLat < mapped.Latitude ) {
        northLat = mapped.Latitude;
      } 
      list[list.length] = {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [mapped.Longitude, mapped.Latitude] },
            properties: { id: record.id, title: mapped.Titre }
      }; 
    }
  });
  //
  // Création la carte
  let map = new maplibregl.Map({
    container: 'map', // id du conteneur de la carte
    style: CarteFacile.mapStyles.simple, // style de carte
    maxZoom: 18.9, // niveau de zoom maximum, adapté aux cartes utilisant les données IGN
  });
  // Ajout d'un contrôle de navigation
  map.addControl(new maplibregl.NavigationControl);
  // Ajout d'une échelle
  map.addControl(new maplibregl.ScaleControl);
  // Pas de bouton de Geolocalisation car l'objectif est de visualiser les données de la table
  // Ajout d'un sélecteur de carte
  map.addControl(new CarteFacile.MapSelectorControl);
  // Création d'un contrôle personnalisé de recentrage sur les données de la table
  class FitBoundsControl {
    onAdd(map) {
      this._map = map;
      // Conteneur du groupe de boutons
      this._container = document.createElement('div');
      this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      // Bouton style natif
      const button = document.createElement('button');
      button.className = 'maplibregl-ctrl-icon fit-bounds-btn';
      button.type = 'button';
      button.title = 'Recentrer sur les données';
      button.onclick = () => {
        map.fitBounds([westLng, southLat, eastLng, northLat], { padding: 75, duration: 1000 });
      };
      this._container.appendChild(button);
      return this._container;
    }
    onRemove() {
      this._container.parentNode.removeChild(this._container);
      this._map = undefined;
    }
  }
  map.addControl(new FitBoundsControl(), 'top-right');
  //
  //
  // Chargement de la carte
  map.on('load', () => {

    // Fit the map to the bounding box with padding
    map.fitBounds([westLng, southLat, eastLng, northLat], {
      padding: 75,   // pixels
      maxZoom: 18.9,   // prevent zooming in too far
      duration: 1000 // animation duration in ms
    });

    // Création des markers et stockage dans un tableau indexé par id de record
    list.forEach( item => { 
      let itemColor = defaultColor;
      if ( item.properties.id == currentRowId ) itemColor = selectedColor;
        
      // Ajout du marqueur sur la carte
      const marker = new maplibregl.Marker({color: itemColor})
          .setLngLat(item.geometry.coordinates)
          .setPopup(new maplibregl.Popup({ offset: 25 }) // Popup au clic
              .setText(item.properties.title))
          .addTo(map);

      // Créer d'un popup pour ce marker
      const hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 25,              // même offset que le popup de sélection
        anchor: 'bottom',        // même anchor
        maxWidth: '240px',
        className: 'maplibregl-popup'
      }).setText(item.properties.title); 
      // Afficher le popup au survol
      marker.getElement().addEventListener('mouseenter', () => {
        hoverPopup.setLngLat(marker.getLngLat()).addTo(map);
      });
      // Retirer le popup quand la souris quitte le marker
      marker.getElement().addEventListener('mouseleave', () => {
        hoverPopup.remove();
      });

      // Gestion du clic sur ce marker
      marker.getElement().addEventListener('click', () => {
          ChangeSelectedMarker(item.properties.id);
      });

      //markers.push(marker);
      markersById[item.properties.id] = marker;
    });  

    // On sélectionne le marker de la première ligne
    if ( currentRowId==null) {
      // On envoie une sélection vide...
      grist.setSelectedRows([]);
      // ... pour que tous les widgets (notamment les fiches) comprennent
      // cette sélection comme un changement d'Etat
      ChangeSelectedMarker(list[0].properties.id);
      markersById[item.properties.id].getElement().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }  
  });

});
grist.onRecord(record => {
  // Puisque ce Widget change la ligne courante de la table avec 
  // grist.selectedRows, il est préférable de ne rien faire ici
});