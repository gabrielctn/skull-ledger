"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

// iOS 27 kills, at launch, any app built with its SDK that has not adopted the
// UIScene lifecycle (UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
// Expo SDK 54 still generates a window-in-AppDelegate template, so:
//   1. declare a scene manifest pointing at SceneDelegate,
//   2. stop the AppDelegate from creating its own window,
//   3. add native/ios/Scene/SceneDelegate.swift to the app target.
const SCENE_SOURCE = "Scene/SceneDelegate.swift";

const WINDOW_BLOCK = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;
const WINDOW_REPLACEMENT = `    // The window is created by SceneDelegate (UIScene lifecycle, required by iOS 27).
`;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
};

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return plistConfig;
  });

  config = withAppDelegate(config, (delegateConfig) => {
    const contents = delegateConfig.modResults.contents;
    if (contents.includes(WINDOW_REPLACEMENT)) return delegateConfig;
    if (!contents.includes(WINDOW_BLOCK)) {
      throw new Error(
        "[withSceneLifecycle] AppDelegate no longer matches the Expo template; update the plugin"
      );
    }
    delegateConfig.modResults.contents = contents.replace(
      WINDOW_BLOCK,
      WINDOW_REPLACEMENT
    );
    return delegateConfig;
  });

  config = withXcodeProject(config, (xcodeConfig) => {
    const project = xcodeConfig.modResults;
    const { projectRoot, platformProjectRoot, projectName } =
      xcodeConfig.modRequest;
    const [targetUuid] = IOSConfig.Target.findFirstNativeTarget(project);

    const source = path.join(projectRoot, "native", "ios", SCENE_SOURCE);
    const destination = path.join(
      platformProjectRoot,
      projectName,
      path.basename(SCENE_SOURCE)
    );
    fs.copyFileSync(source, destination);

    const filepath = `${projectName}/${path.basename(SCENE_SOURCE)}`;
    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project,
        targetUuid,
      });
    }

    xcodeConfig.modResults = project;
    return xcodeConfig;
  });

  return config;
}

module.exports = withSceneLifecycle;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
