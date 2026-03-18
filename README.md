# Kriegspiel Frontend

**Fog of war without fog** — Vue 3 frontend for the Kriegspiel tactical wargame.

## Related

- **Backend**: [kriegsspiel_backend](https://github.com/Dead4W/kriegsspiel_backend/) — Laravel API and game server
- **Resource pack format**: [`docs/resourcepack.md`](docs/resourcepack.md)
- **Default resource pack**: [default_resourcepack.json](https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_resourcepack.json)

## Project Setup

```sh
npm install
```

### Development

```sh
npm run dev
```

### Production build

```sh
npm run build
```

### Lint

```sh
npm run lint
```

## Resource pack

A **resource pack** is a JSON file that defines unit stats, formations, abilities, weather, environment, and combat modifiers. Rooms can use a custom resource pack URL.

- Format docs: [`docs/resourcepack.md`](docs/resourcepack.md)
- Default pack: `https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_resourcepack.json`

## IDE

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (disable Vetur).

## License

See [LICENSE](LICENSE).
