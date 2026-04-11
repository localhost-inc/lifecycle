import { generateOpenAPISpec } from "routedjs/openapi";
import { bridgeOpenApiConfig } from "./openapi-config";
import { routeTree } from "../../routed.gen";

export const bridgeOpenApiSpec = generateOpenAPISpec(routeTree, bridgeOpenApiConfig);
