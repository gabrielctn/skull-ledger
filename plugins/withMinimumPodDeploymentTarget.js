"use strict";

const { withPodfile } = require("@expo/config-plugins");

// Xcode 27 refuses to build any target below iOS 15, and some pods (the
// AsyncStorage resource bundle, at 13.4) still declare an older minimum. Raise
// those to the app's own target after CocoaPods has generated its project.
const MARKER = "# withMinimumPodDeploymentTarget";
const ANCHOR = "  post_install do |installer|\n";
const SNIPPET = `    ${MARKER}
    minimum_target = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_configuration|
        current = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < Gem::Version.new(minimum_target)
          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_target
        end
      end
    end
`;

module.exports = function withMinimumPodDeploymentTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    const contents = podfileConfig.modResults.contents;
    if (contents.includes(MARKER)) return podfileConfig;
    if (!contents.includes(ANCHOR)) {
      throw new Error(
        "[withMinimumPodDeploymentTarget] Podfile has no post_install block to extend"
      );
    }
    podfileConfig.modResults.contents = contents.replace(ANCHOR, ANCHOR + SNIPPET);
    return podfileConfig;
  });
};
