module.exports = ({ config }) => {
  // ARM handset builds use the standard OpenGL backend. Keep the existing
  // Vulkan emulator baseline, whose OpenGL driver drops map labels.
  const handset = ['development', 'preview'].includes(process.env.APK_KIND);
  return {
    ...config,
    plugins: config.plugins.map(plugin => {
      if (!Array.isArray(plugin) || plugin[0] !== '@maplibre/maplibre-react-native') return plugin;
      return [plugin[0], { ...plugin[1], android: { ...plugin[1].android, nativeVariant: handset ? 'opengl' : 'vulkan' } }];
    }),
  };
};
