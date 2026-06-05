import Foundation
import Observation

@Observable
final class ServiceDiagnostics: Identifiable {
    let id: UUID
    let serviceName: String
    var output: String
    var isLoading: Bool

    init(id: UUID = UUID(), serviceName: String, output: String = "", isLoading: Bool = true) {
        self.id = id
        self.serviceName = serviceName
        self.output = output
        self.isLoading = isLoading
    }
}
