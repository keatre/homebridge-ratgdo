/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * discovery.ts: Pure parsing and classification of a bonjour-service mDNS service into a recognized Ratgdo device identity.
 *
 * The platform's discovery callback fires for every mDNS service on the network. This module owns the pure wire-derivation half of that path: validate the TXT record,
 * classify the project_name against the known-variant registry, and normalize the MAC into the two representations downstream code needs. It returns null for any
 * service that is not a Ratgdo (or compatible variant) we configure. The platform-state half - UUID generation, the per-run dedup gates, the resolved log name - stays
 * in the platform because it depends on instance state (hap, feature options, the device maps). Keeping the wire-derivation here makes the validity guard, the project
 * classification, and the MAC regex unit-testable against arbitrary mDNS input without a live network or a Homebridge harness.
 */
import type { DeviceInfo } from "esphome-client";
import type { Nullable } from "homebridge-plugin-utils";
import { RATGDO_AUTODISCOVERY_PROJECTS } from "./settings.ts";
import type { RatgdoVariant } from "./types.ts";
import type { Service } from "bonjour-service";
import { parseMdnsTxt } from "./protocol/mdns.ts";

/* A recognized Ratgdo identity, derived entirely from the mDNS service's wire data - everything parseRatgdoService can determine without platform state. The platform
 * layers UUID generation, the dedup gates, and the resolved device name on top of this.
 *
 * @property address         - The device's first advertised IP address.
 * @property firmwareVersion - The device firmware version (txt.version, falling back to txt.esphome_version; the guard guarantees at least one is present).
 * @property friendlyName    - The mDNS-advertised friendly name, the fallback for the device's display name before the "Ratgdo" default.
 * @property macColon        - The uppercased colon-delimited MAC (AA:BB:...), the form HomeKit's UUID generator and the discovered-device dedup set consume.
 * @property model           - The advertised project version, used as the initial device model before the connected client's deviceInfo refreshes it.
 * @property strippedMac     - The bare-hex MAC (AABB...), the form device.mac, feature-option lookup keys, and MQTT topics consume.
 * @property variant         - The device variant the matched project pattern classifies this device as.
 */
export interface DiscoveredRatgdo {

  readonly address: string;
  readonly firmwareVersion: string;
  readonly friendlyName: string | undefined;
  readonly macColon: string;
  readonly model: string | undefined;
  readonly strippedMac: string;
  readonly variant: RatgdoVariant;
}

function parseRatgdoIdentity(address: string, firmwareVersion: string, friendlyName: string | undefined, mac: string, model: string | undefined,
  projectName: string): Nullable<DiscoveredRatgdo> {

  const project = RATGDO_AUTODISCOVERY_PROJECTS.find((entry) => entry.pattern.test(projectName));
  const strippedMac = mac.replace(/[:-]/g, "").toUpperCase();

  if(!project || !/^[0-9A-F]{12}$/.test(strippedMac)) {

    return null;
  }

  return {

    address,
    firmwareVersion,
    friendlyName,
    macColon: strippedMac.replace(/(..)(?=.)/g, "$1:"),
    model,
    strippedMac,
    variant: project.variant
  };
}

/* Parse and classify a bonjour-service mDNS advertisement. */
export function parseRatgdoService(service: Service): Nullable<DiscoveredRatgdo> {

  const txt = parseMdnsTxt(service.txt);
  const address = service.addresses?.[0];
  const firmwareVersion = txt?.version ?? txt?.esphome_version;

  if(!txt?.mac || !address || !firmwareVersion || (txt.project_name === undefined)) {

    return null;
  }

  return parseRatgdoIdentity(address, firmwareVersion, txt.friendly_name, txt.mac, txt.project_version, txt.project_name);
}

/* Parse the same identity from the authoritative DeviceInfo returned by a direct ESPHome connection. */
export function parseRatgdoDeviceInfo(address: string, info: Nullable<DeviceInfo>): Nullable<DiscoveredRatgdo> {

  if(!info?.esphomeVersion || !info.macAddress || !info.projectName) {

    return null;
  }

  return parseRatgdoIdentity(address, info.esphomeVersion, info.friendlyName ?? info.name, info.macAddress, info.projectVersion, info.projectName);
}
